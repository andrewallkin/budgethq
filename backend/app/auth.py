import os
from datetime import datetime, timedelta
from typing import Literal, Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models, database

AuthorizedContext = Literal["registration", "login", "username_change"]

_RESTRICTED_MESSAGES = {
    "registration": "Registration is currently restricted. Only authorized users can create accounts.",
    "login": "Access restricted. This account is not authorized to login.",
    "username_change": "Username must be in the authorized users list",
}


def is_authorized_users_restriction_enabled() -> bool:
    value = os.getenv("RESTRICT_AUTHORIZED_USERS", "true").strip().lower()
    if value in ("false", "0", "no"):
        return False
    if value in ("true", "1", "yes", ""):
        return True
    return True


def get_authorized_users_list() -> list[str]:
    authorized_users = os.getenv("AUTHORIZED_USERS", "")
    if not authorized_users:
        return []
    return [u.strip() for u in authorized_users.split(",") if u.strip()]


def ensure_username_authorized(
    username: str,
    *,
    context: AuthorizedContext = "registration",
    headers: dict | None = None,
) -> None:
    if not is_authorized_users_restriction_enabled():
        return
    if username not in get_authorized_users_list():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_RESTRICTED_MESSAGES[context],
            headers=headers,
        )

# Secret key for JWT encoding/decoding
SECRET_KEY = "your-secret-key-keep-it-secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user
