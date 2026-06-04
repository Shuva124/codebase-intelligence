from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.models.repository import Repository
from app.services.git_service import GitService
from app.services.parser_service import CodeParserService
from app.services.vector_service import VectorService

def process_repository(repo_id: int):
    """
    The background worker that runs the entire ingestion pipeline.
    """
    # Create a fresh database connection for this background task
    db: Session = SessionLocal()
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    
    if not repo:
        db.close()
        return

    # 1. Update SQL status to indexing
    repo.status = "indexing"
    db.commit()

    try:
        print(f"Starting ingestion for {repo.name}...")
        
        # 2. Clone the repository
        git_service = GitService()
        repo_path = git_service.clone_repository(repo.url)

        # 3. Parse the files into chunks
        parser = CodeParserService()
        files = parser.walk_repository(repo_path)
        
        all_chunks = []
        for file in files:
            chunks = parser.parse_file(file, repo_path)
            all_chunks.extend(chunks)

        print(f"Parsed {len(all_chunks)} chunks from {repo.name}. Generating vectors...")

        # 4. Embed and store in ChromaDB
        vector_service = VectorService()
        vector_service.embed_and_store(all_chunks, repo.id)

        # 5. Success! Update SQL status
        repo.status = "completed"
        db.commit()
        print(f"Ingestion complete for {repo.name}!")

    except Exception as e:
        print(f"Ingestion failed for repo {repo_id}: {e}")
        repo.status = "failed"
        db.commit()
    finally:
        db.close()