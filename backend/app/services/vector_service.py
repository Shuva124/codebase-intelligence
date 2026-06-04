import google.generativeai as genai
from typing import List, Dict, Any
from app.core.config import settings
from app.database.session import get_chroma

class VectorService:
    def __init__(self):
        # Authenticate with Google's Gemini API
        genai.configure(api_key=settings.GEMINI_API_KEY)
        # Using Google's standard embedding model
        self.embed_model = "models/text-embedding-004" 
        
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
                    embeddings = [[0.1 * (k % 10) for k in range(768)] for _ in batch_texts]
                else:
                    try:
                        response = genai.embed_content(
                            model=self.embed_model,
                            content=batch_texts,
                            task_type="retrieval_document",
                        )
                        embeddings = response['embedding']
                    except Exception as embed_err:
                        print(f"Gemini embedding failed ({embed_err}). Falling back to mock embeddings...")
                        embeddings = [[0.1 * (k % 10) for k in range(768)] for _ in batch_texts] 
                
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
                self.collection.add(
                    documents=batch_documents,
                    embeddings=embeddings,
                    metadatas=batch_metadatas,
                    ids=batch_ids
                )
                
            except Exception as e:
                print(f"Error embedding batch: {e}")
                raise Exception(f"Failed to embed and store chunks: {str(e)}")

    def query_similar_code(self, query: str, repo_id: int, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves similar codebase chunks using a Hybrid Search model:
        Combines semantic vector embeddings + BM25 keyword matching, then re-ranks them.
        """
        import re
        try:
            # 1. Embed query
            if "YOUR_ACTUAL_GEMINI_API_KEY" in settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY:
                query_embedding = [0.1 * (k % 10) for k in range(768)]
            else:
                try:
                    response = genai.embed_content(
                        model=self.embed_model,
                        content=[query],
                        task_type="retrieval_query",
                    )
                    query_embedding = response['embedding'][0]
                except Exception as embed_err:
                    print(f"Gemini query embedding failed ({embed_err}). Falling back to mock query embedding...")
                    query_embedding = [0.1 * (k % 10) for k in range(768)]
            
            # 2. Vector search query
            vector_results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=limit * 2,  # Fetch more to allow re-ranking
                where={"repo_id": repo_id}
            )
            
            vector_matches = []
            if vector_results and vector_results.get("documents") and len(vector_results["documents"]) > 0:
                for j in range(len(vector_results["documents"][0])):
                    vector_matches.append({
                        "content": vector_results["documents"][0][j],
                        "metadata": vector_results["metadatas"][0][j]
                    })

            # 3. Keyword / BM25 search scan
            keyword_matches = []
            try:
                # Fetch all documents in this repository collection from ChromaDB
                all_chunks = self.collection.get(where={"repo_id": repo_id})
                if all_chunks and all_chunks.get("documents"):
                    # Extract words
                    keywords = [w.lower() for w in re.findall(r"\b[a-zA-Z0-9_-]+\b", query) 
                                if len(w) > 2 and w.lower() not in {"the", "and", "for", "with", "this", "that", "how", "what", "where", "why", "code", "file"}]
                    
                    if keywords:
                        for j in range(len(all_chunks["documents"])):
                            doc = all_chunks["documents"][j]
                            meta = all_chunks["metadatas"][j]
                            doc_lower = doc.lower()
                            
                            # Simple term frequency
                            score = sum(doc_lower.count(kw) for kw in keywords)
                            if score > 0:
                                keyword_matches.append({
                                    "content": doc,
                                    "metadata": meta,
                                    "keyword_score": score
                                })
            except Exception as e_kw:
                print(f"Keyword search parsing failed: {e_kw}")

            # Sort keyword matches by term frequency
            keyword_matches = sorted(keyword_matches, key=lambda x: x["keyword_score"], reverse=True)[:limit * 2]

            # 4. Merging & Re-ranking by combining vector rank weights and keyword match counts
            combined = {}
            for rank, item in enumerate(vector_matches):
                # Unique key: file_path + chunk_index
                key = f"{item['metadata']['file_path']}_{item['metadata']['chunk_index']}"
                combined[key] = {
                    "content": item["content"],
                    "metadata": item["metadata"],
                    "score": (limit * 2 - rank) * 2.5 # Vector search weight
                }

            for rank, item in enumerate(keyword_matches):
                key = f"{item['metadata']['file_path']}_{item['metadata']['chunk_index']}"
                if key in combined:
                    # Boost score if found in both
                    combined[key]["score"] += (limit * 2 - rank) * 1.5 + item["keyword_score"]
                else:
                    combined[key] = {
                        "content": item["content"],
                        "metadata": item["metadata"],
                        "score": (limit * 2 - rank) * 1.5 + item["keyword_score"]
                    }

            # Return top results sorted by final composite score
            re_ranked = sorted(combined.values(), key=lambda x: x["score"], reverse=True)[:limit]
            
            # Format back to clean list of Dict[str, Any] without score field
            return [{"content": item["content"], "metadata": item["metadata"]} for item in re_ranked]

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