import secrets
from datetime import datetime, timedelta
from typing import Literal, Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models, database
from .config import get_settings

AuthorizedContext = Literal["registration", "login", "username_change"]
EXTERNAL_API_KEY_PREFIX = "bhq_"
EXTERNAL_API_KEY_LOOKUP_LEN = 12

_RESTRICTED_MESSAGES = {
    "registration": "Registration is currently restricted. Only authorized users can create accounts.",
    "login": "Access restricted. This account is not authorized to login.",
    "username_change": "Username must be in the authorized users list",
}


def get_authorized_users_list() -> list[str]:
    return get_settings().authorized_users_list


def ensure_username_authorized(
    username: str,
    *,
    context: AuthorizedContext = "registration",
    headers: dict | None = None,
) -> None:
    if not get_authorized_users_list():
        return
    if username not in get_authorized_users_list():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_RESTRICTED_MESSAGES[context],
            headers=headers,
        )

ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")
external_api_bearer = HTTPBearer(auto_error=True)

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    settings = get_settings()
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, get_settings().jwt_secret_key, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def create_external_api_key_material() -> tuple[str, str, str]:
    """Return (full_key, lookup_prefix, bcrypt_hash) for a new external API key."""
    secret = secrets.token_urlsafe(32)
    full_key = f"{EXTERNAL_API_KEY_PREFIX}{secret}"
    lookup_prefix = full_key[:EXTERNAL_API_KEY_LOOKUP_LEN]
    key_hash = get_password_hash(full_key)
    return full_key, lookup_prefix, key_hash


def _resolve_external_key(db, token: str) -> tuple | None:
    """Return (user, scope) where scope is "write" or "read", else None."""
    lookup_prefix = token[:EXTERNAL_API_KEY_LOOKUP_LEN]

    user = db.query(models.User).filter(
        models.User.external_api_key_prefix == lookup_prefix,
        models.User.external_api_key_hash.isnot(None),
    ).first()
    if user is not None and verify_password(token, user.external_api_key_hash):
        return user, "write"

    user = db.query(models.User).filter(
        models.User.external_api_key_ro_prefix == lookup_prefix,
        models.User.external_api_key_ro_hash.isnot(None),
    ).first()
    if user is not None and verify_password(token, user.external_api_key_ro_hash):
        return user, "read"

    return None


def _external_key_dependency(require_write: bool):
    async def _dependency(
        credentials: HTTPAuthorizationCredentials = Depends(external_api_bearer),
        db: Session = Depends(database.get_db),
    ):
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
        token = (credentials.credentials or "").strip()
        if not token.startswith(EXTERNAL_API_KEY_PREFIX) or len(token) < 20:
            raise credentials_exception
        resolved = _resolve_external_key(db, token)
        if resolved is None:
            raise credentials_exception
        user, key_scope = resolved
        if require_write and key_scope != "write":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This endpoint requires the full-access API key",
            )
        return user

    return _dependency


async def get_user_from_external_api_key(
    credentials: HTTPAuthorizationCredentials = Depends(external_api_bearer),
    db: Session = Depends(database.get_db),
):
    """Authenticate machine clients via per-user BudgetHQ API keys (bhq_...).

    Accepts both the full-access key and the read-only key.
    """
    return await _external_key_dependency(require_write=False)(credentials, db)


get_user_from_external_api_key_write = _external_key_dependency(require_write=True)
