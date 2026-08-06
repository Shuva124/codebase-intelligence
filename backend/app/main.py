# Monkeypatch posthog.capture to prevent TypeError due to signature mismatch with chromadb
try:
    import posthog
    _orig_capture = posthog.capture
    def safe_posthog_capture(*args, **kwargs):
        if getattr(posthog, "disabled", False):
            return None
        if len(args) == 3:
            distinct_id, event, properties = args
            return _orig_capture(event=event, distinct_id=distinct_id, properties=properties, **kwargs)
        elif len(args) == 2:
            distinct_id, event = args
            return _orig_capture(event=event, distinct_id=distinct_id, **kwargs)
        return _orig_capture(*args, **kwargs)
    posthog.capture = safe_posthog_capture
except ImportError:
    pass

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

# Setup CORS origins to allow our Next.js frontend (local & production Vercel) to interact with the API
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in origins:
    origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.onrender\.com)(:\d+)?",
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