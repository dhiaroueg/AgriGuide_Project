"""HS256 JWT validation compatible with the Auth service."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException


def _jwt_secret_key() -> str:
    """Lit la clé au moment de la validation.

    `app.main` charge le `.env` pendant son initialisation, après que certains
    routeurs ont importé ce module. Une constante évaluée à l'import pouvait
    donc garder la valeur de développement et invalider tous les JWT émis par
    Auth malgré une clé correctement définie dans `.env`.
    """
    return os.getenv("JWT_SECRET_KEY", "dev-secret-change-me-in-production")


def _decode_segment(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def decode_access_token(token: str) -> str:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
        signed = f"{header_segment}.{payload_segment}".encode()
        expected = hmac.new(_jwt_secret_key().encode(), signed, hashlib.sha256).digest()
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


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if os.getenv("BUSINESS_AUTH_DISABLED", "0").lower() in {"1", "true", "yes"}:
        return "00000000-0000-0000-0000-000000000000"
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentification requise.")
    try:
        return decode_access_token(authorization.split(" ", 1)[1])
    except ValueError:
        raise HTTPException(status_code=401, detail="Session invalide, reconnectez-vous.")
