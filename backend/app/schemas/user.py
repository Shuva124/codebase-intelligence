from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class UserOAuthSync(BaseModel):
    email: EmailStr
    provider_id: str
    provider: str = "github"
    avatar_url: Optional[str] = None
    github_access_token: str 

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    avatar_url: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True