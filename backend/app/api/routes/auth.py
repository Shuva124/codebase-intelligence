from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.user import User
from app.schemas.user import UserOAuthSync, UserResponse

router = APIRouter()

@router.post("/sync", response_model=UserResponse)
def sync_oauth_user(user_in: UserOAuthSync, db: Session = Depends(get_db)):
    """
    Called by Next.js after a successful GitHub OAuth login.
    Creates a new user if they don't exist, or returns the existing one.
    """
    # Check if user already exists
    user = db.query(User).filter(User.provider_id == user_in.provider_id).first()
    
    if not user:
        # Create new user
        user = User(
            email=user_in.email,
            provider=user_in.provider,
            provider_id=user_in.provider_id,
            avatar_url=user_in.avatar_url
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
    return user