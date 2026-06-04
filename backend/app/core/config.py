from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Codebase Intelligence Platform"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    POSTGRES_URL: str
    CHROMA_PERSIST_DIR: str
    GEMINI_API_KEY: str
    
    # ADD THIS LINE:
    REPO_STORAGE_DIR: str = "/tmp/repos" 
    
    GITHUB_CLIENT_ID: str = "MOCK"
    GITHUB_CLIENT_SECRET: str = "MOCK"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()