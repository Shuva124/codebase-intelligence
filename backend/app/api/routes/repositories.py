from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks # Add BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import requests
from app.database.session import get_db
from app.models.repository import Repository
from app.schemas.repository import RepositoryCreate, RepositoryResponse
from app.models.user import User

# ADD THIS IMPORT:
from app.services.git_service import GitService

router = APIRouter()
git_service = GitService() # Initialize our service

# ... keeping get_public_repositories and sync_user_github_repos the same ...

@router.post("/index", response_model=RepositoryResponse)
def submit_repository(
    repo_in: RepositoryCreate, 
    background_tasks: BackgroundTasks, # Add this to handle slow tasks asynchronously
    db: Session = Depends(get_db)
):
    url_str = str(repo_in.url).rstrip("/")
    if "github.com/" not in url_str:
        raise HTTPException(status_code=400, detail="Must be a valid GitHub URL")
        
    repo_name = url_str.split("github.com/")[-1]

    existing_repo = db.query(Repository).filter(Repository.url == url_str).first()
    if existing_repo:
        return existing_repo

    new_repo = Repository(
        url=url_str,
        name=repo_name,
        is_public=repo_in.is_public,
        status="pending",
        owner_id=1 
    )
    db.add(new_repo)
    db.commit()
    db.refresh(new_repo)
    
    # NEW: Trigger the cloning process as a background task so the user doesn't wait!
    # (For now, we call the cloning method. In the next step, we will wrap this into an ingestion pipeline)
    background_tasks.add_task(git_service.clone_repository, url_str)
    
    return new_repo