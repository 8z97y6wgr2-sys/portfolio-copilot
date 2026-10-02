import hashlib
import secrets
import time
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from .db import AuthAttempt, LoginSession, User

PASSWORDS = PasswordHash.recommended()
DUMMY_HASH = PASSWORDS.hash(secrets.token_urlsafe(32))
COOKIE = "ea_session"


def db_session(request: Request):
    with request.app.state.db() as db:
        yield db


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def current_user(request: Request, db: Session = Depends(db_session)):
    token = request.cookies.get(COOKIE, "")
    session = db.get(LoginSession, digest(token)) if token else None
    if not session or session.expires_at <= int(time.time()):
        raise HTTPException(401, "Inicia sesión para acceder a tus portafolios.")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "La sesión ya no está disponible.")
    return user


def throttle(db, request, email):
    now = int(time.time())
    # The Next.js server is the trusted entrypoint. A shared IP budget deliberately
    # fails closed; production must use an edge limiter for per-client quotas.
    host = request.client.host if request.client else "unknown"
    keys = [(digest("ip:" + host), 100), (digest("email:" + email), 10)]
    db.execute(delete(AuthAttempt).where(AuthAttempt.at < now - 900))
    for key, limit in keys:
        count = db.scalar(select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key == key, AuthAttempt.at >= now - 900))
        if count >= limit:
            db.commit()
            raise HTTPException(429, "Demasiados intentos. Vuelve a intentar en 15 minutos.")
    for key, _ in keys:
        db.add(AuthAttempt(key=key, at=now))
    db.commit()


def start_session(db, response, request, user):
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(old)))
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= int(time.time())))
    token = secrets.token_urlsafe(32)
    settings = request.app.state.settings
    db.add(LoginSession(token_hash=digest(token), user_id=user.id, expires_at=int(time.time()) + settings.session_seconds))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=settings.session_seconds, httponly=True,
                        secure=settings.cookie_secure, samesite="lax", path="/")


def public_user(user):
    return {"id": user.id, "name": user.name, "email": user.email}
