import os
from fastapi import Header, HTTPException
from jose import JWTError, jwt

def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentification requise.")
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], os.getenv("JWT_SECRET_KEY", "dev-secret-change-me-in-production"), algorithms=["HS256"])
        if not payload.get("sub"):
            raise ValueError
        return str(payload["sub"])
    except (JWTError, ValueError):
        raise HTTPException(401, "Session invalide ou expirée.")
