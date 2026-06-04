from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import auth, repositories, analytics
from app.database.session import engine, Base
from app.models.user import User
from app.models.repository import Repository

# Initialize PostgreSQL schema on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Setup CORS origins to allow our Next.js frontend to interact with the API
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP methods
    allow_headers=["*"],  # Allows all headers
)

# Register route controllers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(repositories.router, prefix=f"{settings.API_V1_STR}/repositories", tags=["repositories"])
app.include_router(analytics.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["analytics"])

@app.get("/")
def read_root():
    return {"message": f"Welcome to the {settings.PROJECT_NAME} API!"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}