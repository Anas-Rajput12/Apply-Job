from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db import get_db
from app.security import hash_password, verify_password, create_token

router = APIRouter()

class AuthBody(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(body: AuthBody):
    email = body.email.lower().strip()

    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO users(email, password_hash) VALUES(?, ?)",
            (email, hash_password(body.password))
        )
        conn.commit()
        return {
            "access_token": create_token(cur.lastrowid),
            "user_id": cur.lastrowid
        }
    except Exception:
        raise HTTPException(409, "Email already registered")
    finally:
        conn.close()

@router.post("/login")
def login(body: AuthBody):
    email = body.email.lower().strip()

    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE email = ?",
        (email,)
    ).fetchone()
    conn.close()

    if not user or not verify_password(
        body.password,
        user["password_hash"]
    ):
        raise HTTPException(401, "Invalid email or password")

    return {
        "access_token": create_token(user["id"]),
        "user_id": user["id"]
    }
