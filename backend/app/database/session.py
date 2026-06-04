from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import chromadb
from app.core.config import settings
import os

# Database Setup (Supports Postgres & SQLite)
connect_args = {"check_same_thread": False} if settings.POSTGRES_URL.startswith("sqlite") else {}
engine = create_engine(settings.POSTGRES_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ChromaDB Setup
os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)

def get_chroma():
    return chroma_client