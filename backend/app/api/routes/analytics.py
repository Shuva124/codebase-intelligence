from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pathlib import Path
from typing import Dict, Any

from app.database.session import get_db
from app.models.repository import Repository
from app.models.user import User
from app.api.deps import get_current_user
from app.core.config import settings
from app.services.git_service import GitService
from app.services.analytics_service import AnalyticsService

router = APIRouter()

def get_repo_storage_path(repo: Repository) -> Path:
    """Parses repository URL and resolves its cloned local path."""
    git_service = GitService()
    folder_name = git_service.parse_repo_url(repo.url)
    return Path(settings.REPO_STORAGE_DIR) / folder_name

@router.get("/{repo_id}/analytics")
def get_repository_metrics(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns total files, functions, lines, largest modules, and language breakdown.
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id,
        Repository.owner_id == current_user.id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    repo_path = get_repo_storage_path(repo)
    analytics_service = AnalyticsService()
    return analytics_service.get_repo_metrics(repo_path)

@router.get("/{repo_id}/contributors")
def get_repository_contributors(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns commit authors, commit count percentages, and expert matrix of file ownership.
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id,
        Repository.owner_id == current_user.id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    repo_path = get_repo_storage_path(repo)
    analytics_service = AnalyticsService()
    return analytics_service.get_git_analytics(repo_path)

@router.get("/{repo_id}/timeline")
def get_repository_timeline(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns a list of recent commits with author and date metadata.
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id,
        Repository.owner_id == current_user.id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    repo_path = get_repo_storage_path(repo)
    analytics_service = AnalyticsService()
    return analytics_service.get_git_analytics(repo_path)["timeline"]

@router.get("/{repo_id}/audit")
def get_repository_audit(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Scans the repository files for security alerts and dead/unused code.
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id,
        Repository.owner_id == current_user.id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    repo_path = get_repo_storage_path(repo)
    analytics_service = AnalyticsService()
    return analytics_service.run_code_audit(repo_path)
