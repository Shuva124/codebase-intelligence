from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from app.database.session import Base

class Repository(Base):
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    status = Column(String, default="pending") 
    is_public = Column(Boolean, default=True) 
    
    owner_id = Column(Integer, ForeignKey("users.id"))
    indexed_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())