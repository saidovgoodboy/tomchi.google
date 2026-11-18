import base64
import hashlib
import hmac
import json
import secrets
import time

from app.config import get_settings


def create_session_token(username: str, secret: str | None = None) -> str:
    settings = get_settings()
    signing_secret = (secret or settings.admin_token_secret).encode("utf-8")
    payload = {
        "u": username,
        "exp": int(time.time()) + settings.admin_token_ttl_seconds,
        "jti": secrets.token_hex(8),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    sig = hmac.new(
        signing_secret,
        b64.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{b64}.{sig}"


def verify_session_token(token: str, secret: str | None = None) -> str | None:
    if "." not in token:
        return None
    b64, sig = token.split(".", 1)
    settings = get_settings()
    signing_secret = (secret or settings.admin_token_secret).encode("utf-8")
    expected = hmac.new(
        signing_secret,
        b64.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    padded = b64 + "=" * (-len(b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return str(payload.get("u", ""))
