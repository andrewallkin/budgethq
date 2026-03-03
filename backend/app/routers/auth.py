import logging
import os
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .. import models, database, auth
from ..utils import encrypt_api_key, decrypt_api_key
from ..logging_utils import redact_email

logger = logging.getLogger(__name__)

# Pydantic Models for Auth
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class OpenAIKeyRequest(BaseModel):
    api_key: str

class OpenAIKeyStatus(BaseModel):
    has_key: bool

class UsernameChangeRequest(BaseModel):
    username: str

class UserPreferences(BaseModel):
    has_investec_account: bool

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(database.get_db)):
    # Restrict registration to authorized users only
    authorized_users = os.environ.get("AUTHORIZED_USERS")
    authorized_list = [u.strip() for u in authorized_users.split(",")]
    if user.username not in authorized_list:
        raise HTTPException(
            status_code=403,
            detail="Registration is currently restricted. Only authorized users can create accounts."
        )

    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    access_token = auth.create_access_token(data={"sub": new_user.username})
    logger.info(
        "User registered",
        extra={"user_id": new_user.id, "username": redact_email(new_user.username)},
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Restrict login to authorized users only
    authorized_users = os.environ.get("AUTHORIZED_USERS")
    authorized_list = [u.strip() for u in authorized_users.split(",")]
    if user.username not in authorized_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted. This account is not authorized to login.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = auth.create_access_token(data={"sub": user.username})
    logger.info(
        "User logged in",
        extra={"user_id": user.id, "username": redact_email(user.username)},
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Verify current password
    if not auth.verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )

    # Validate new password length
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters"
        )

    # Update password
    current_user.hashed_password = auth.get_password_hash(request.new_password)
    db.commit()
    logger.info("Password changed", extra={"user_id": current_user.id})
    return {"status": "success", "message": "Password changed successfully"}


@router.put("/user/settings/openai-key")
async def save_openai_key(
    request: OpenAIKeyRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Save or update user's OpenAI API key (encrypted)."""
    if not request.api_key or len(request.api_key.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key cannot be empty"
        )
    
    # Encrypt the API key
    try:
        encrypted_key = encrypt_api_key(request.api_key.strip())
        current_user.openai_api_key = encrypted_key
        db.commit()
        logger.info("OpenAI API key saved", extra={"user_id": current_user.id})
        return {"status": "success", "message": "OpenAI API key saved successfully"}
    except Exception as e:
        logger.exception("OpenAI API key save failed: %s: %s", type(e).__name__, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save API key: {str(e)}"
        )


@router.get("/user/settings/openai-key", response_model=OpenAIKeyStatus)
async def check_openai_key(
    current_user: models.User = Depends(auth.get_current_user)
):
    """Check if user has an OpenAI API key configured."""
    has_key = current_user.openai_api_key is not None and len(current_user.openai_api_key) > 0
    return {"has_key": has_key}


@router.delete("/user/settings/openai-key")
async def delete_openai_key(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Delete user's OpenAI API key."""
    current_user.openai_api_key = None
    db.commit()
    logger.info("OpenAI API key deleted", extra={"user_id": current_user.id})
    return {"status": "success", "message": "OpenAI API key deleted successfully"}


@router.get("/user/preferences", response_model=UserPreferences)
async def get_user_preferences(
    current_user: models.User = Depends(auth.get_current_user)
):
    """Get user preferences. has_investec_account is true if the flag is set OR credentials exist."""
    has_credentials = all([
        current_user.investec_client_id,
        current_user.investec_client_secret,
        current_user.investec_api_key
    ])
    return {"has_investec_account": bool(current_user.has_investec_account) or has_credentials}


@router.put("/user/preferences", response_model=UserPreferences)
async def update_user_preferences(
    preferences: UserPreferences,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update user preferences."""
    current_user.has_investec_account = preferences.has_investec_account
    db.commit()
    return {"has_investec_account": current_user.has_investec_account}


@router.put("/user/username")
async def change_username(
    request: UsernameChangeRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Change user's username. Must still be in authorized users list."""
    new_username = request.username.strip()
    
    if not new_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username cannot be empty"
        )
    
    # Check if username is in authorized list
    authorized_users = os.environ.get("AUTHORIZED_USERS")
    authorized_list = [u.strip() for u in authorized_users.split(",")]
    if new_username not in authorized_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Username must be in the authorized users list"
        )
    
    # Check if username is already taken by another user
    existing_user = db.query(models.User).filter(
        models.User.username == new_username,
        models.User.id != current_user.id
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken"
        )
    
    # Update username
    current_user.username = new_username
    db.commit()
    logger.info(
        "Username changed",
        extra={"user_id": current_user.id, "username": redact_email(new_username)},
    )
    return {"status": "success", "message": "Username updated successfully"}
