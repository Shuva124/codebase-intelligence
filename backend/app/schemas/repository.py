from pydantic import BaseModel, HttpUrl
from datetime import datetime
from typing import Optional

class RepositoryCreate(BaseModel):
    url: HttpUrl
    is_public: bool = True

class RepositoryResponse(BaseModel):
    id: int
    url: str
    name: str
    status: str
    is_public: bool
    owner_id: int
    indexed_at: Optional[datetime]

    class Config:
        from_attributes = True