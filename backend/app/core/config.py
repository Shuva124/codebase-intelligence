from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Codebase Intelligence Platform"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    # Databases
    POSTGRES_URL: str
    CHROMA_PERSIST_DIR: str
    
    # AI Providers
    GEMINI_API_KEY: str

    class Config:
        env_file = ".env"
        case_sensitive = True

# THIS IS THE LINE IT IS LOOKING FOR:
settings = Settings()