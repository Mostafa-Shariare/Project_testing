"""JWT, password hashing, and simple in-memory rate limiting."""
import datetime
import time
from collections import defaultdict
from typing import DefaultDict, List

import bcrypt
import jwt
from fastapi import HTTPException

from backend.app.config import get_settings

settings = get_settings()
ALGORITHM = "HS256"

_rate_buckets: DefaultDict[str, List[float]] = defaultdict(list)


def rate_limit(key: str, max_calls: int, window_sec: float) -> None:
    now = time.time()
    bucket = [t for t in _rate_buckets[key] if now - t < window_sec]
    if len(bucket) >= max_calls:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    bucket.append(now)
    _rate_buckets[key] = bucket


def rate_limit_ip(ip: str, username: str, max_calls: int, window_sec: float) -> None:
    """Rate limit by IP and username combined — prevents brute-force across accounts."""
    rate_limit(f"ip:{ip}", max_calls * 2, window_sec)
    rate_limit(f"auth:{username}", max_calls, window_sec)


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def verify_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_join_token(session_id: str, class_code: str, student_id: str, minutes: int = 5) -> str:
    """Generate a short-lived single-purpose join token for Socratic sessions."""
    payload = {
        "sub": student_id,
        "session_id": session_id,
        "class_code": class_code,
        "scope": "socratic_join",
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def verify_join_token(token: str) -> dict | None:
    """Verify and decode a Socratic join token."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        if payload.get("scope") != "socratic_join":
            return None
        return payload
    except jwt.PyJWTError:
        return None

