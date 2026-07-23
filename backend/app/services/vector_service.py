import os
import pickle
import queue
import threading
from concurrent.futures import ThreadPoolExecutor
import google.generativeai as genai
import cohere
import time
import math
import re
from typing import List, Dict, Any
from app.core.config import settings
from app.database.session import get_chroma

# Initialize Cohere Client (Ensure COHERE_API_KEY is in your settings or environment)
cohere_api_key = getattr(settings, "COHERE_API_KEY", os.environ.get("COHERE_API_KEY"))
co = cohere.Client(cohere_api_key)

print("Cohere client initialized for Embeddings and Reranking")

def generate_content_with_fallback(prompt: str, stream: bool = False):
    """
    Uses Gemini for answer generation, fulfilling the generation step of RAG.
    """
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
        Executes BM25 Indexing, Cohere Embedding API, and DB Ingestion in parallel threads.
        """
        if not chunks:
            return

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

        def embed_api_task():
            import concurrent.futures
            
            texts_to_embed = [chunk["content"] for chunk in chunks]
            batch_size = 96
            
            # 1. Lower the safety threshold to 80,000 (gives a 20k buffer)
            TOKEN_LIMIT_PER_MIN = 80000 
            tokens_in_window = 0
            window_start = time.time()
            
            def _api_worker(b_texts, b_chunks, max_retries=3):
                for attempt in range(max_retries):
                    try:
                        embeddings_response = co.embed(
                            texts=b_texts,
                            model="embed-english-v3.0",
                            input_type="search_document"
                        )
                        embeddings = embeddings_response.embeddings
                        
                        b_documents = []
                        b_metadatas = []
                        b_ids = []
                        
                        for chunk in b_chunks:
                            doc_id = f"repo_{repo_id}_{chunk['metadata']['file_path']}_{chunk['metadata']['chunk_index']}"
                            meta = chunk["metadata"].copy()
                            meta["repo_id"] = repo_id
                            
                            b_documents.append(chunk["content"])
                            b_metadatas.append(meta)
                            b_ids.append(doc_id)
                        
                        db_queue.put((b_documents, embeddings, b_metadatas, b_ids))
                        return
                        
                    except Exception as api_err:
                        if "429" in str(api_err) or "rate limit" in str(api_err).lower():
                            if attempt < max_retries - 1:
                                # 2. If we hit the limit, we MUST wait for the minute window to reset. 
                                print(f"[API] Token bucket exhausted. Sleeping 60s for minute rollover (Attempt {attempt + 1}/{max_retries})...")
                                time.sleep(60.0) 
                            else:
                                raise api_err
                        else:
                            raise api_err

            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as api_pool:
                    futures = []
                    
                    for i in range(0, len(texts_to_embed), batch_size):
                        batch_texts = texts_to_embed[i:i + batch_size]
                        batch_chunks = chunks[i:i + batch_size]
                        
                        # 3. Conservative token estimation: assume 1 token per 3 chars, plus a baseline of 5 tokens per chunk
                        estimated_batch_tokens = sum((len(text) // 3) + 5 for text in batch_texts)
                        
                        current_time = time.time()
                        elapsed_in_window = current_time - window_start
                        
                        if elapsed_in_window >= 60.0:
                            tokens_in_window = 0
                            window_start = current_time
                            
                        elif tokens_in_window + estimated_batch_tokens > TOKEN_LIMIT_PER_MIN:
                            sleep_time = 60.0 - elapsed_in_window
                            if sleep_time > 0:
                                print(f"[API] Max throughput reached ({tokens_in_window} tokens). Yielding for {sleep_time:.2f}s...")
                                time.sleep(sleep_time)
                            
                            tokens_in_window = 0
                            window_start = time.time()
                        
                        tokens_in_window += estimated_batch_tokens
                        
                        future = api_pool.submit(_api_worker, batch_texts, batch_chunks)
                        futures.append(future)
                    
                    for future in concurrent.futures.as_completed(futures):
                        future.result() 
                        
            except Exception as e:
                db_queue.put(e)  
                raise e
            finally:
                db_queue.put(None)
                
        def db_insert_task():
            while True:
                item = db_queue.get()
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item 

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
            api_future = executor.submit(embed_api_task)
            bm25_future = executor.submit(build_bm25_task)
            
            # Wait for completion and raise any exceptions that occurred in the threads
            bm25_future.result()
            api_future.result()
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

    def rerank_candidates_with_cohere(self, query: str, candidates: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
        if not candidates:
            return []
        
        try:
            documents = [item["content"] for item in candidates]
            
            response = co.rerank(
                model="rerank-english-v3.0",
                query=query,
                documents=documents,
                top_n=limit
            )
            
            reranked_candidates = []
            for result in response.results:
                candidate_index = result.index
                reranked_candidates.append(candidates[candidate_index])
                
            return reranked_candidates
        except Exception as err:
            print(f"Cohere re-ranking failed ({err}). Falling back to RRF rankings...")
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

            # Use Cohere to Embed the Query
            try:
                query_embedding_response = co.embed(
                    texts=[query],
                    model="embed-english-v3.0",
                    input_type="search_query"
                )
                query_embedding = query_embedding_response.embeddings[0]
            except Exception as embed_err:
                print(f"Cohere query embedding failed ({embed_err}). Falling back to default baseline...")
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
            
            # Use Cohere Rerank API
            final_ranked = self.rerank_candidates_with_cohere(query, candidates_to_rerank, limit)

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