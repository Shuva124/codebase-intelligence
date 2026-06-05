import google.generativeai as genai
import time
import math
import re
from typing import List, Dict, Any
from app.core.config import settings
from app.database.session import get_chroma

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

def embed_content_with_fallback(texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
    models = ["models/gemini-embedding-2", "models/gemini-embedding-001"]
    for model_name in models:
        try:
            max_retries = 3
            backoff = 2
            for attempt in range(max_retries):
                try:
                    response = genai.embed_content(
                        model=model_name,
                        content=texts,
                        task_type=task_type,
                    )
                    return response['embedding']
                except Exception as embed_err:
                    if "429" in str(embed_err) or "quota" in str(embed_err).lower() or "limit" in str(embed_err).lower():
                        if attempt < max_retries - 1:
                            sleep_time = backoff * (2 ** attempt)
                            print(f"Rate limit (429) hit during embedding with {model_name}. Retrying in {sleep_time} seconds (attempt {attempt + 1}/{max_retries})...")
                            time.sleep(sleep_time)
                            continue
                    raise embed_err
        except Exception as e:
            print(f"Embedding with model {model_name} failed: {e}. Trying next fallback...")
            continue
    raise Exception("All Gemini embedding models in fallback chain failed.")

class BM25Retriever:
    def __init__(self, corpus: List[Dict[str, Any]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus = corpus
        self.doc_len = []
        self.avg_doc_len = 0.0
        self.doc_term_freqs = []
        self.idf = {}
        self.doc_count = len(corpus)
        self._initialize()

    def _tokenize(self, text: str) -> List[str]:
        tokens = [w.lower() for w in re.findall(r"\b[a-zA-Z0-9_-]+\b", text) if len(w) > 1]
        stemmed_tokens = []
        for t in tokens:
            # Simple singularization to handle singular/plural mismatches (e.g. schemas vs schema, models vs model)
            if t.endswith("s") and len(t) > 2 and not t.endswith("ss"):
                stemmed_tokens.append(t[:-1])
            stemmed_tokens.append(t)
        return stemmed_tokens

    def _initialize(self):
        total_len = 0
        df = {}
        for item in self.corpus:
            tokens = self._tokenize(item["content"])
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
        # Authenticate with Google's Gemini API
        genai.configure(api_key=settings.GEMINI_API_KEY)
        # Using Google's standard embedding model
        self.embed_model = "models/gemini-embedding-2" 
        
        # Connect to your local ChromaDB
        self.chroma_client = get_chroma()
        
        # A collection in ChromaDB is just like a table in PostgreSQL
        self.collection = self.chroma_client.get_or_create_collection(
            name="codebase_chunks"
        )

    def embed_and_store(self, chunks: List[Dict[str, Any]], repo_id: int):
        """
        Sends the code chunks to Gemini to get vectors (embeddings), 
        and saves them into ChromaDB for AI searching.
        """
        if not chunks:
            return

        texts_to_embed = [chunk["content"] for chunk in chunks]
        
        # We process in batches of 100 to avoid hitting API size limits
        batch_size = 100
        
        for i in range(0, len(texts_to_embed), batch_size):
            batch_texts = texts_to_embed[i:i + batch_size]
            batch_chunks = chunks[i:i + batch_size]
            
            try:
                # 1. Ask Gemini to convert the code text into Math Vectors
                # Fallback to mock embeddings if API key is not set to allow offline/local testing
                if "YOUR_ACTUAL_GEMINI_API_KEY" in settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY:
                    embeddings = [[0.1 * (k % 10) for k in range(3072)] for _ in batch_texts]
                else:
                    try:
                        embeddings = embed_content_with_fallback(batch_texts, task_type="retrieval_document")
                    except Exception as embed_err:
                        print(f"Gemini embedding failed ({embed_err}). Falling back to mock embeddings...")
                        embeddings = [[0.1 * (k % 10) for k in range(3072)] for _ in batch_texts] 
                
                # 2. Prepare the data packages for ChromaDB
                batch_documents = []
                batch_metadatas = []
                batch_ids = []
                
                for j, chunk in enumerate(batch_chunks):
                    # Chroma requires a unique string ID for every single chunk
                    doc_id = f"repo_{repo_id}_{chunk['metadata']['file_path']}_{chunk['metadata']['chunk_index']}"
                    
                    # Attach the repo_id so we can filter searches by repository later!
                    meta = chunk["metadata"]
                    meta["repo_id"] = repo_id
                    
                    batch_documents.append(chunk["content"])
                    batch_metadatas.append(meta)
                    batch_ids.append(doc_id)
                
                # 3. Save everything into the Vector Database
                try:
                    self.collection.add(
                        documents=batch_documents,
                        embeddings=embeddings,
                        metadatas=batch_metadatas,
                        ids=batch_ids
                    )
                except Exception as e_add:
                    # If we encounter a dimension mismatch (e.g. from prior mock 768-dim run), recreate the collection
                    if "dimension" in str(e_add).lower() or "dimensionality" in str(e_add).lower():
                        print("Dimension mismatch detected in ChromaDB collection. Re-creating collection 'codebase_chunks'...")
                        try:
                            self.chroma_client.delete_collection("codebase_chunks")
                            self.collection = self.chroma_client.get_or_create_collection(name="codebase_chunks")
                            self.collection.add(
                                documents=batch_documents,
                                embeddings=embeddings,
                                metadatas=batch_metadatas,
                                ids=batch_ids
                            )
                        except Exception as e_recreate:
                            print(f"Failed to recover from dimension mismatch: {e_recreate}")
                            raise e_add
                    else:
                        raise e_add
                
            except Exception as e:
                print(f"Error embedding batch: {e}")
                raise Exception(f"Failed to embed and store chunks: {str(e)}")

    def reciprocal_rank_fusion(self, vector_results: List[Dict[str, Any]], bm25_results: List[Dict[str, Any]], k: int = 60) -> List[Dict[str, Any]]:
        """
        Combines vector search matches and BM25 matches using Reciprocal Rank Fusion.
        """
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
        """
        Queries Gemini to re-rank candidate code snippets based on query relevance.
        Falls back to original RRF order if Gemini is unconfigured/fails.
        """
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
                
                # Fill remaining spots if less than limit was outputted
                for idx, item in enumerate(candidates):
                    if idx not in seen:
                        reranked.append(item)
                return reranked[:limit]
        except Exception as err:
            print(f"Gemini re-ranking failed ({err}). Falling back to RRF rankings...")
        
        return candidates[:limit]

    def query_similar_code(self, query: str, repo_id: int, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves similar codebase chunks using a Hybrid Search model:
        Combines semantic vector embeddings + BM25 keyword matching, then re-ranks them.
        """
        try:
            # 1. Detect scope from query
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

            # If a specific scope is requested, retrieve more candidates so filtering doesn't leave us empty
            retrieve_limit = limit * 6 if scope != "both" else limit * 3

            # 2. Embed query
            if "YOUR_ACTUAL_GEMINI_API_KEY" in settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY:
                query_embedding = [0.1 * (k % 10) for k in range(3072)]
            else:
                try:
                    embeddings = embed_content_with_fallback([query], task_type="retrieval_query")
                    query_embedding = embeddings[0]
                except Exception as embed_err:
                    print(f"Gemini query embedding failed ({embed_err}). Falling back to mock query embedding...")
                    query_embedding = [0.1 * (k % 10) for k in range(3072)]
            
            # 3. Semantic Vector search query
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

            # 4. BM25 Keyword Search
            bm25_matches = []
            try:
                all_chunks = self.collection.get(where={"repo_id": repo_id})
                if all_chunks and all_chunks.get("documents") and len(all_chunks["documents"]) > 0:
                    corpus = []
                    for j in range(len(all_chunks["documents"])):
                        corpus.append({
                            "content": all_chunks["documents"][j],
                            "metadata": all_chunks["metadatas"][j]
                        })
                    
                    bm25 = BM25Retriever(corpus)
                    scores = bm25.get_scores(query)
                    
                    scored_corpus = []
                    for idx, score in enumerate(scores):
                        if score > 0.0:
                            file_path = corpus[idx]["metadata"].get("file_path", "")
                            if is_file_in_scope(file_path):
                                item = corpus[idx].copy()
                                item["bm25_score"] = score
                                scored_corpus.append(item)
                    
                    scored_corpus = sorted(scored_corpus, key=lambda x: x["bm25_score"], reverse=True)
                    bm25_matches = scored_corpus[:retrieve_limit]
            except Exception as e_bm25:
                print(f"BM25 retrieval failed: {e_bm25}")

            # 5. Fusion (RRF)
            fused_candidates = self.reciprocal_rank_fusion(vector_matches, bm25_matches)

            # Boost matches based on query intent and file path keywords (e.g. model, schema, db)
            query_lower = query.lower()
            if "schema" in query_lower or "model" in query_lower or "db" in query_lower or "database" in query_lower:
                for item in fused_candidates:
                    file_path = item["metadata"].get("file_path", "").lower()
                    if "model" in file_path or "schema" in file_path or "db" in file_path:
                        item["rrf_score"] = item.get("rrf_score", 0.0) * 2.0
                # Re-sort fused candidates after boosting
                fused_candidates = sorted(fused_candidates, key=lambda x: x.get("rrf_score", 0.0), reverse=True)

            # 6. Re-ranking
            # Expand the list passed to LLM for re-ranking to get a better selection
            rerank_pool_size = limit * 3 if scope != "both" else limit * 2
            candidates_to_rerank = fused_candidates[:rerank_pool_size]
            final_ranked = self.rerank_candidates_with_gemini(query, candidates_to_rerank, limit)

            return [{"content": item["content"], "metadata": item["metadata"]} for item in final_ranked]

        except Exception as e:
            print(f"Error in hybrid search: {e}")
            raise Exception(f"Hybrid search failed: {str(e)}")

    def delete_repository_vectors(self, repo_id: int):
        """
        Deletes all code chunks associated with a repo_id from ChromaDB.
        """
        try:
            self.collection.delete(where={"repo_id": repo_id})
        except Exception as e:
            print(f"Error deleting vectors for repo {repo_id}: {e}")
            raise Exception(f"Failed to delete repository vectors: {str(e)}")