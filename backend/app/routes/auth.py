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
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters"
        )

    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users(email, password_hash)
                VALUES(%s, %s)
                RETURNING id
                """,
                (email, hash_password(body.password))
            )

            user_id = cur.fetchone()["id"]

        conn.commit()

        return {
            "access_token": create_token(user_id),
            "user_id": user_id
        }

    except Exception as exc:
        conn.rollback()

        if "duplicate key" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="Email already registered"
            )

        raise HTTPException(
            status_code=500,
            detail="Registration failed"
        )

    finally:
        conn.close()


@router.post("/login")
def login(body: AuthBody):
    email = body.email.lower().strip()

    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM users WHERE email = %s",
                (email,)
            )

            user = cur.fetchone()

    finally:
        conn.close()

    if not user or not verify_password(
        body.password,
        user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    return {
        "access_token": create_token(user["id"]),
        "user_id": user["id"]
    }
