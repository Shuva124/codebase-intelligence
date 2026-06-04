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
                response = genai.embed_content(
                    model=self.embed_model,
                    content=batch_texts,
                    task_type="retrieval_document",
                )
                
                embeddings = response['embedding'] 
                
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