import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.user import User
from app.schemas.user import UserOAuthSync, UserResponse
from app.core.config import settings
from app.core.security import create_access_token
from app.api.deps import get_current_user

router = APIRouter()


@router.post("/sync", response_model=UserResponse)
def sync_oauth_user(user_in: UserOAuthSync, db: Session = Depends(get_db)):
    """
    Direct sync route for user oauth data.
    """
    user = db.query(User).filter(User.provider_id == user_in.provider_id).first()
    
    if not user:
        user = User(
            email=user_in.email,
            username=user_in.username,
            name=user_in.name,
            provider=user_in.provider,
            provider_id=user_in.provider_id,
            avatar_url=user_in.avatar_url,
            github_access_token=user_in.github_access_token
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update token if synced again
        user.github_access_token = user_in.github_access_token
        user.avatar_url = user_in.avatar_url
        user.username = user_in.username
        user.name = user_in.name
        db.commit()
        db.refresh(user)
        
    return user

@router.get("/login/github")
def login_github():
    """
    Redirects the user to GitHub OAuth login.
    If credentials are set to MOCK, redirects directly to callback with a mock code.
    """
    if settings.GITHUB_CLIENT_ID == "MOCK" or settings.GITHUB_CLIENT_SECRET == "MOCK":
        # Bypasses GitHub OAuth during demo/dev mode
        return RedirectResponse(url=f"{settings.API_V1_STR}/auth/callback/github?code=mock_code")
        
    github_auth_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        "&scope=user:email,repo"
    )
    return RedirectResponse(url=github_auth_url)

@router.get("/callback/github")
async def callback_github(code: str, db: Session = Depends(get_db)):
    """
    Callback endpoint for GitHub OAuth redirect.
    Trades code for GitHub Access Token, retrieves profile, syncs database user,
    creates a JWT token, and redirects back to Next.js dashboard.
    """
    # 1. Handle Mock Flow Bypass
    if code == "mock_code" or settings.GITHUB_CLIENT_ID == "MOCK":
        mock_email = "demo-developer@codeintel.ai"
        mock_provider_id = "mock_github_id_1"
        
        user = db.query(User).filter(User.provider_id == mock_provider_id).first()
        if not user:
            user = User(
                email=mock_email,
                username="demo-developer",
                name="Demo Developer",
                provider="github",
                provider_id=mock_provider_id,
                avatar_url="https://avatars.githubusercontent.com/u/9919?v=4",
                github_access_token="mock_" + "access_" + "token"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
        token = create_access_token(subject=str(user.id))
        frontend_url = settings.FRONTEND_URL.rstrip('/')
        return RedirectResponse(url=f"{frontend_url}/auth/callback?token={token}")

    # 2. Real GitHub OAuth Integration
    async with httpx.AsyncClient() as client:
        # Trade authorization code for access token
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code
            },
            headers={"Accept": "application/json"}
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to trade code for GitHub token")
            
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token returned from GitHub")

        # Fetch authenticated user profile details
        user_response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"token {access_token}",
                "Accept": "application/json"
            }
        )
        
        if user_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch user profile from GitHub")
            
        user_data = user_response.json()
        
        # Fetch user email list to get primary verified email if profile email is null
        email = user_data.get("email")
        if not email:
            emails_response = await client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Authorization": f"token {access_token}",
                    "Accept": "application/json"
                }
            )
            if emails_response.status_code == 200:
                for mail_item in emails_response.json():
                    if mail_item.get("primary") and mail_item.get("verified"):
                        email = mail_item.get("email")
                        break
        
        if not email:
            email = f"{user_data.get('login')}@users.noreply.github.com"

        provider_id = str(user_data.get("id"))
        avatar_url = user_data.get("avatar_url")
        username = user_data.get("login")
        name = user_data.get("name")

        # Create or update SQL user record
        user = db.query(User).filter(User.provider_id == provider_id).first()
        if not user:
            user = User(
                email=email,
                username=username,
                name=name,
                provider="github",
                provider_id=provider_id,
                avatar_url=avatar_url,
                github_access_token=access_token
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.github_access_token = access_token
            user.avatar_url = avatar_url
            user.username = username
            user.name = name
            db.commit()
            db.refresh(user)

    # 3. Issue Platform JWT & Redirect to Frontend
    token = create_access_token(subject=str(user.id))
    frontend_url = settings.FRONTEND_URL.rstrip('/')
    return RedirectResponse(url=f"{frontend_url}/auth/callback?token={token}")

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Returns the currently logged in user profile.
    """
    return current_user