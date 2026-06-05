from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, index=True, nullable=True)
    name = Column(String, nullable=True)
    
    provider = Column(String, default="github")
    provider_id = Column(String, unique=True, index=True, nullable=False)
    
    # NEW: Store the GitHub OAuth Access Token
    github_access_token = Column(String, nullable=True) 
    
    avatar_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())