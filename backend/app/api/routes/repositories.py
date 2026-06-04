from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import requests
from app.database.session import get_db
from app.models.repository import Repository
from app.schemas.repository import RepositoryCreate, RepositoryResponse
from app.models.user import User

router = APIRouter()

@router.get("/public", response_model=List[RepositoryResponse])
def get_public_repositories(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(Repository).filter(Repository.is_public == True).offset(skip).limit(limit).all()

@router.get("/github-sync/{user_id}")
def sync_user_github_repos(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.github_access_token:
        raise HTTPException(status_code=400, detail="User GitHub token not found")

    headers = {
        "Authorization": f"Bearer {user.github_access_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    response = requests.get("https://api.github.com/user/repos?visibility=all&per_page=100", headers=headers)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch from GitHub API")

    return {"repositories": [
        {
            "name": repo["full_name"],
            "url": repo["html_url"],
            "is_private": repo["private"],
            "description": repo["description"]
        } for repo in response.json()
    ]}

@router.post("/index", response_model=RepositoryResponse)
def submit_repository(repo_in: RepositoryCreate, db: Session = Depends(get_db)):
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
    
    return new_repo