import os
import pickle
import queue
import threading
from concurrent.futures import ThreadPoolExecutor
import google.generativeai as genai
import time
import math
import re
from typing import List, Dict, Any
from app.core.config import settings
from app.database.session import get_chroma
from sentence_transformers import SentenceTransformer
import torch

if torch.cuda.is_available():
    print(f"Using GPU: {torch.cuda.get_device_name(0)}")
else:
    print("Using CPU")

device = "cuda" if torch.cuda.is_available() else "cpu"

# BGE-large-en-v1.5 outputs 1024-dimensional embeddings
embedding_model = SentenceTransformer(
    "BAAI/bge-large-en-v1.5",
    device=device
)

print(f"Embedding model loaded on {device}")

def generate_content_with_fallback(prompt: str, stream: bool = False):
    models = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]
    for model_name in models:
        try:
            model = genai.GenerativeModel(model_name)
            if stream:
                response = model.generate_content(prompt, stream=True)
                iterator = iter(response)
                try:
                    first_chunk = next(iterator)
                    def gen():
                        yield first_chunk
                        for chunk in iterator:
                            yield chunk
                    return gen()
                except StopIteration:
                    def gen():
                        return
                        yield
                    return gen()
            else:
                response = model.generate_content(prompt)
                return response
        except Exception as e:
            print(f"Model {model_name} failed: {e}. Trying next fallback...")
            continue
    raise Exception("All Gemini models in fallback chain failed.")


class BM25Retriever:
    def __init__(self, corpus: List[Dict[str, Any]] = None, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus = corpus or []
        self.doc_len = []
        self.avg_doc_len = 0.0
        self.doc_term_freqs = []
        self.idf = {}
        self.doc_count = len(self.corpus)
        if self.corpus:
            self._initialize()

    def _tokenize(self, text: str) -> List[str]:
        tokens = [w.lower() for w in re.findall(r"\b[a-zA-Z0-9_-]+\b", text) if len(w) > 1]
        stemmed_tokens = []
        for t in tokens:
            if t.endswith("s") and len(t) > 2 and not t.endswith("ss"):
                stemmed_tokens.append(t[:-1])
            stemmed_tokens.append(t)
        return stemmed_tokens

    def _initialize(self):
        total_len = 0
        df = {}
        for item in self.corpus:
            # OPTIMIZATION: Use pre-tokenized chunks if the parser provided them
            tokens = item.get("tokens") if "tokens" in item else self._tokenize(item["content"])
            
            self.doc_len.append(len(tokens))
            total_len += len(tokens)
            
            tf = {}
            for token in tokens:
                tf[token] = tf.get(token, 0) + 1
            self.doc_term_freqs.append(tf)
            
            for token in tf.keys():
                df[token] = df.get(token, 0) + 1

        self.avg_doc_len = total_len / self.doc_count if self.doc_count > 0 else 0.0

        for token, count in df.items():
            self.idf[token] = math.log((self.doc_count - count + 0.5) / (count + 0.5) + 1.0)

    def get_scores(self, query: str) -> List[float]:
        query_tokens = self._tokenize(query)
        scores = []
        for idx in range(self.doc_count):
            score = 0.0
            tf_dict = self.doc_term_freqs[idx]
            doc_len = self.doc_len[idx]
            for token in query_tokens:
                if token in tf_dict:
                    tf = tf_dict[token]
                    idf_val = self.idf.get(token, 0.0)
                    denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len))
                    score += idf_val * (tf * (self.k1 + 1.0)) / denominator
            scores.append(score)
        return scores


class VectorService:
    def __init__(self):
        self.chroma_client = get_chroma()
        self.collection = self.chroma_client.get_or_create_collection(name="codebase_chunks")
        
        self.bm25_indices: Dict[int, BM25Retriever] = {}
        self.bm25_cache_dir = "bm25_cache"
        os.makedirs(self.bm25_cache_dir, exist_ok=True)

    def embed_and_store(self, chunks: List[Dict[str, Any]], repo_id: int):
        """
        Executes BM25 Indexing, GPU Embedding, and DB Ingestion in parallel threads.
        """
        if not chunks:
            return

        # Queue sizes bounded to prevent memory bloat if GPU is much faster than I/O
        db_queue = queue.Queue(maxsize=5)

        def build_bm25_task():
            try:
                print(f"[CPU] Building BM25 index for repo {repo_id}...")
                bm25 = BM25Retriever(corpus=chunks)
                self.bm25_indices[repo_id] = bm25
                
                cache_path = os.path.join(self.bm25_cache_dir, f"repo_{repo_id}.pkl")
                with open(cache_path, "wb") as f:
                    pickle.dump(bm25, f)
                print(f"[CPU] BM25 index saved to {cache_path}")
            except Exception as e:
                print(f"Warning: Failed to build/save BM25 index: {e}")

        def gpu_encode_task():
            try:
                texts_to_embed = [chunk["content"] for chunk in chunks]
                batch_size = 100
                
                for i in range(0, len(texts_to_embed), batch_size):
                    batch_texts = texts_to_embed[i:i + batch_size]
                    batch_chunks = chunks[i:i + batch_size]
                    
                    # GPU processing
                    embeddings = embedding_model.encode(
                        batch_texts,
                        batch_size=32,
                        convert_to_numpy=True,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    ).tolist()
                    
                    batch_documents = []
                    batch_metadatas = []
                    batch_ids = []
                    
                    for chunk in batch_chunks:
                        doc_id = f"repo_{repo_id}_{chunk['metadata']['file_path']}_{chunk['metadata']['chunk_index']}"
                        meta = chunk["metadata"].copy()
                        meta["repo_id"] = repo_id
                        
                        batch_documents.append(chunk["content"])
                        batch_metadatas.append(meta)
                        batch_ids.append(doc_id)
                    
                    # Pass off to DB ingestor thread
                    db_queue.put((batch_documents, embeddings, batch_metadatas, batch_ids))
            
            except Exception as e:
                db_queue.put(e)  # Pass exception down to surface it
                raise e
            finally:
                db_queue.put(None)  # Sentinel to stop DB consumer

        def db_insert_task():
            while True:
                item = db_queue.get()
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item  # Raise the exception from the GPU thread

                batch_documents, embeddings, batch_metadatas, batch_ids = item
                
                try:
                    self.collection.add(
                        documents=batch_documents,
                        embeddings=embeddings,
                        metadatas=batch_metadatas,
                        ids=batch_ids
                    )
                except Exception as e_add:
                    if "dimension" in str(e_add).lower() or "dimensionality" in str(e_add).lower():
                        print("[I/O] Dimension mismatch detected. Re-creating collection 'codebase_chunks'...")
                        self.chroma_client.delete_collection("codebase_chunks")
                        self.collection = self.chroma_client.get_or_create_collection(name="codebase_chunks")
                        self.collection.add(
                            documents=batch_documents,
                            embeddings=embeddings,
                            metadatas=batch_metadatas,
                            ids=batch_ids
                        )
                    else:
                        raise e_add

        # Run all three tasks concurrently
        with ThreadPoolExecutor(max_workers=3) as executor:
            db_future = executor.submit(db_insert_task)
            gpu_future = executor.submit(gpu_encode_task)
            bm25_future = executor.submit(build_bm25_task)
            
            # Wait for completion and raise any exceptions that occurred in the threads
            bm25_future.result()
            gpu_future.result()
            db_future.result()

    def reciprocal_rank_fusion(self, vector_results: List[Dict[str, Any]], bm25_results: List[Dict[str, Any]], k: int = 60) -> List[Dict[str, Any]]:
        rrf_scores = {}
        for rank, item in enumerate(vector_results):
            key = f"{item['metadata']['file_path']}_{item['metadata']['chunk_index']}"
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (k + rank + 1)
            
        for rank, item in enumerate(bm25_results):
            key = f"{item['metadata']['file_path']}_{item['metadata']['chunk_index']}"
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (k + rank + 1)

        all_candidates = {}
        for item in vector_results + bm25_results:
            key = f"{item['metadata']['file_path']}_{item['metadata']['chunk_index']}"
            all_candidates[key] = item

        sorted_keys = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
        
        fused_results = []
        for key in sorted_keys:
            item = all_candidates[key].copy()
            item["rrf_score"] = rrf_scores[key]
            fused_results.append(item)
            
        return fused_results

    def rerank_candidates_with_gemini(self, query: str, candidates: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
        if not candidates:
            return []
        if "YOUR_ACTUAL_GEMINI_API_KEY" in settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY:
            return candidates[:limit]
        
        try:
            candidates_text = ""
            for idx, item in enumerate(candidates):
                file_path = item["metadata"].get("file_path", "unknown")
                content = item["content"]
                content_snippet = content[:600]
                candidates_text += f"[Candidate Index {idx}] (File: {file_path})\n{content_snippet}\n---\n"
            
            prompt = (
                "You are an expert system re-ranker. Given a user query and a set of candidate code snippets, "
                "select the most relevant candidate snippets that contain the specific code structure, declaration, or logic "
                "to answer the query.\n\n"
                f"User Query: {query}\n\n"
                "Candidate Code Snippets:\n"
                f"{candidates_text}\n"
                "Instructions:\n"
                f"- Select the top {limit} most relevant snippets from the list of candidates above.\n"
                "- Return your selection as a JSON list of candidate indices in order of relevance (e.g., [2, 0, 4, 1]).\n"
                "- Output ONLY the JSON list itself. Do not include any explanations, introduction, markdown blocks, or other text."
            )
            
            genai.configure(api_key=settings.GEMINI_API_KEY)
            response = generate_content_with_fallback(prompt, stream=False)
            
            import json
            resp_text = response.text.strip()
            if resp_text.startswith("```"):
                resp_text = re.sub(r"^```(?:json)?\n", "", resp_text)
                resp_text = re.sub(r"\n```$", "", resp_text)
            resp_text = resp_text.strip()
            
            indices = json.loads(resp_text)
            if isinstance(indices, list):
                reranked = []
                seen = set()
                for index in indices:
                    if isinstance(index, int) and 0 <= index < len(candidates) and index not in seen:
                        reranked.append(candidates[index])
                        seen.add(index)
                
                for idx, item in enumerate(candidates):
                    if idx not in seen:
                        reranked.append(item)
                return reranked[:limit]
        except Exception as err:
            print(f"Gemini re-ranking failed ({err}). Falling back to RRF rankings...")
        
        return candidates[:limit]

    def query_similar_code(self, query: str, repo_id: int, limit: int = 5) -> List[Dict[str, Any]]:
        try:
            query_lower = query.lower()
            backend_keywords = {
                "backend", "server", "database", "db", "api", "controller", "route", "endpoints", 
                "fastapi", "uvicorn", "sqlalchemy", "model", "schema", "auth.py", "deps.py", "session.py"
            }
            frontend_keywords = {
                "frontend", "client", "ui", "interface", "page", "component", "react", "next", 
                "styling", "css", "tailwind", "zustand", "store", "toast", "page.tsx", "layout.tsx"
            }
            
            has_backend = any(kw in query_lower for kw in backend_keywords)
            has_frontend = any(kw in query_lower for kw in frontend_keywords)
            
            scope = "both"
            if has_backend and not has_frontend:
                scope = "backend"
            elif has_frontend and not has_backend:
                scope = "frontend"

            def is_file_in_scope(file_path: str) -> bool:
                if scope == "both":
                    return True
                normalized = file_path.replace("\\", "/").lower()
                is_backend_file = "backend/" in normalized or normalized.startswith("backend/")
                is_frontend_file = "frontend/" in normalized or normalized.startswith("frontend/")
                
                if not is_backend_file and not is_frontend_file:
                    ext = "." + normalized.split(".")[-1] if "." in normalized else ""
                    if ext in [".py", ".go", ".java"]:
                        is_backend_file = True
                    elif ext in [".tsx", ".jsx", ".css", ".scss"]:
                        is_frontend_file = True
                        
                if scope == "backend":
                    return not is_frontend_file
                if scope == "frontend":
                    return not is_backend_file
                return True

            retrieve_limit = limit * 6 if scope != "both" else limit * 3

            try:
                query_embedding = embedding_model.encode(
                    query,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False
                ).tolist()
            except Exception as embed_err:
                print(f"Local BGE query embedding failed ({embed_err}). Falling back to default baseline...")
                query_embedding = [0.0] * 1024
            
            vector_matches = []
            try:
                vector_results = self.collection.query(
                    query_embeddings=[query_embedding],
                    n_results=retrieve_limit,
                    where={"repo_id": repo_id}
                )
                if vector_results and vector_results.get("documents") and len(vector_results["documents"]) > 0:
                    for j in range(len(vector_results["documents"][0])):
                        file_path = vector_results["metadatas"][0][j].get("file_path", "")
                        if is_file_in_scope(file_path):
                            vector_matches.append({
                                "content": vector_results["documents"][0][j],
                                "metadata": vector_results["metadatas"][0][j]
                            })
            except Exception as e_query:
                if "dimension" in str(e_query).lower() or "dimensionality" in str(e_query).lower():
                    print(f"Dimension mismatch during query: {e_query}. Falling back to empty vector results.")
                else:
                    raise e_query

            bm25_matches = []
            try:
                bm25 = self.bm25_indices.get(repo_id)
                
                if not bm25:
                    cache_path = os.path.join(self.bm25_cache_dir, f"repo_{repo_id}.pkl")
                    if os.path.exists(cache_path):
                        with open(cache_path, "rb") as f:
                            bm25 = pickle.load(f)
                            self.bm25_indices[repo_id] = bm25
                
                if bm25 and bm25.corpus:
                    scores = bm25.get_scores(query)
                    
                    scored_corpus = []
                    for idx, score in enumerate(scores):
                        if score > 0.0:
                            file_path = bm25.corpus[idx]["metadata"].get("file_path", "")
                            if is_file_in_scope(file_path):
                                item = bm25.corpus[idx].copy()
                                item["bm25_score"] = score
                                scored_corpus.append(item)
                    
                    scored_corpus = sorted(scored_corpus, key=lambda x: x["bm25_score"], reverse=True)
                    bm25_matches = scored_corpus[:retrieve_limit]
            except Exception as e_bm25:
                print(f"BM25 retrieval failed: {e_bm25}")

            fused_candidates = self.reciprocal_rank_fusion(vector_matches, bm25_matches)

            if "schema" in query_lower or "model" in query_lower or "db" in query_lower or "database" in query_lower:
                for item in fused_candidates:
                    file_path = item["metadata"].get("file_path", "").lower()
                    if "model" in file_path or "schema" in file_path or "db" in file_path:
                        item["rrf_score"] = item.get("rrf_score", 0.0) * 2.0
                fused_candidates = sorted(fused_candidates, key=lambda x: x.get("rrf_score", 0.0), reverse=True)

            rerank_pool_size = limit * 3 if scope != "both" else limit * 2
            candidates_to_rerank = fused_candidates[:rerank_pool_size]
            final_ranked = self.rerank_candidates_with_gemini(query, candidates_to_rerank, limit)

            return [{"content": item["content"], "metadata": item["metadata"]} for item in final_ranked]

        except Exception as e:
            print(f"Error in hybrid search: {e}")
            raise Exception(f"Hybrid search failed: {str(e)}")

    def delete_repository_vectors(self, repo_id: int):
        try:
            self.collection.delete(where={"repo_id": repo_id})
            
            self.bm25_indices.pop(repo_id, None)
            
            cache_path = os.path.join(self.bm25_cache_dir, f"repo_{repo_id}.pkl")
            if os.path.exists(cache_path):
                os.remove(cache_path)
                
        except Exception as e:
            print(f"Error deleting vectors for repo {repo_id}: {e}")
            raise Exception(f"Failed to delete repository vectors: {str(e)}")