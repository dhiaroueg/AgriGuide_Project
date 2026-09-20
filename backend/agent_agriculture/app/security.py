"""HS256 JWT validation compatible with the Auth service (same secret / payload)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException


JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me-in-production")


def _decode_segment(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def decode_access_token(token: str) -> str:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
        signed = f"{header_segment}.{payload_segment}".encode()
        expected = hmac.new(JWT_SECRET_KEY.encode(), signed, hashlib.sha256).digest()
        actual = _decode_segment(signature_segment)
        if not hmac.compare_digest(expected, actual):
            raise ValueError("signature")
        header = json.loads(_decode_segment(header_segment))
        payload = json.loads(_decode_segment(payload_segment))
        if header.get("alg") != "HS256":
            raise ValueError("algorithm")
        if payload.get("exp") is not None and float(payload["exp"]) < time.time():
            raise ValueError("expired")
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("subject")
        return str(user_id)
    except Exception as exc:
        raise ValueError("Token invalide ou expiré") from exc


def get_optional_user_id(authorization: str | None = Header(default=None)) -> str | None:
    """Return user id when a valid Bearer token is present; None if absent.

    Invalid/expired tokens still raise 401 so a stale session is not silently
    treated as anonymous.

    Exception: the literal token "dev-bypass-token" sent by the frontend when
    VITE_SKIP_AUTH=true is treated as anonymous (no user id) rather than raising
    a 401 — this mirrors the AGRI_AUTH_DISABLED=true dev bypass already in .env.
    """
    # Dev bypass: no auth header → anonymous
    if not authorization:
        return None
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="En-tête Authorization invalide.")
    raw_token = authorization.split(" ", 1)[1].strip()
    # Frontend VITE_SKIP_AUTH=true sends the literal string "dev-bypass-token".
    # Treat it as anonymous so the chatbot works without a real JWT in dev mode.
    auth_disabled = os.getenv("AGRI_AUTH_DISABLED", "").lower() in ("1", "true", "yes")
    if auth_disabled or raw_token == "dev-bypass-token":
        return None
    try:
        return decode_access_token(raw_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Session invalide, reconnectez-vous.")

