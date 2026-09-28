from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.db import get_db
from app.security import (
    hash_password,
    verify_password,
    create_token,
)

from app.email_service import (
    send_verification_email,
    send_password_reset_email,
)

import random


router = APIRouter()


# =========================================================
# MODELS
# =========================================================

class AuthBody(BaseModel):
    email: EmailStr
    password: str


class EmailBody(BaseModel):
    email: EmailStr


class VerifyCodeBody(BaseModel):
    email: EmailStr
    code: str


class ResetPasswordBody(BaseModel):
    email: EmailStr
    code: str
    new_password: str


# =========================================================
# DATABASE MIGRATION
# PostgreSQL version
# =========================================================

def ensure_auth_columns():
    conn = get_db()

    try:
        columns = conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'users'
            """
        ).fetchall()

        existing_columns = {
            row["column_name"]
            for row in columns
        }

        # -------------------------------------------------
        # is_verified
        # -------------------------------------------------

        if "is_verified" not in existing_columns:
            conn.execute(
                """
                ALTER TABLE users
                ADD COLUMN is_verified INTEGER DEFAULT 0
                """
            )

        # -------------------------------------------------
        # verification_code
        # -------------------------------------------------

        if "verification_code" not in existing_columns:
            conn.execute(
                """
                ALTER TABLE users
                ADD COLUMN verification_code TEXT
                """
            )

        # -------------------------------------------------
        # reset_code
        # -------------------------------------------------

        if "reset_code" not in existing_columns:
            conn.execute(
                """
                ALTER TABLE users
                ADD COLUMN reset_code TEXT
                """
            )

        conn.commit()

    except Exception:
        conn.rollback()
        raise

    finally:
        conn.close()


# Run migration once when module loads
ensure_auth_columns()


# =========================================================
# CODE GENERATOR
# =========================================================

def generate_code():
    return str(
        random.randint(100000, 999999)
    )


# =========================================================
# PASSWORD VALIDATION
# =========================================================

def validate_password(password: str):

    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters",
        )


# =========================================================
# REGISTER
# =========================================================

@router.post("/register")
def register(body: AuthBody):

    email = str(
        body.email
    ).lower().strip()

    validate_password(
        body.password
    )

    conn = get_db()

    try:

        # -------------------------------------------------
        # CHECK EXISTING USER
        # -------------------------------------------------

        existing_user = conn.execute(
            """
            SELECT id, is_verified
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

        # -------------------------------------------------
        # EXISTING ACCOUNT
        # -------------------------------------------------

        if existing_user:

            if existing_user["is_verified"]:
                raise HTTPException(
                    status_code=409,
                    detail="Email already registered",
                )

            verification_code = generate_code()

            conn.execute(
                """
                UPDATE users
                SET verification_code = %s
                WHERE email = %s
                """,
                (
                    verification_code,
                    email,
                ),
            )

            conn.commit()

            try:

                send_verification_email(
                    email,
                    verification_code,
                )

            except Exception as e:

                print(
                    "VERIFICATION EMAIL ERROR:",
                    repr(e),
                )

                raise HTTPException(
                    status_code=500,
                    detail="Verification email could not be sent",
                )

            return {
                "message": (
                    "Account already exists. "
                    "A new verification code was sent "
                    "to your email."
                ),
                "email": email,
            }

        # -------------------------------------------------
        # NEW ACCOUNT
        # -------------------------------------------------

        verification_code = generate_code()

        password_hash = hash_password(
            body.password
        )

        # PostgreSQL does not support lastrowid.
        # Use RETURNING id instead.
        cur = conn.execute(
            """
            INSERT INTO users (
                email,
                password_hash,
                is_verified,
                verification_code,
                reset_code
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                email,
                password_hash,
                0,
                verification_code,
                None,
            ),
        )

        user_id = cur.fetchone()["id"]

        conn.commit()

        # -------------------------------------------------
        # SEND VERIFICATION EMAIL
        # -------------------------------------------------

        try:

            send_verification_email(
                email,
                verification_code,
            )

        except Exception as e:

            print(
                "VERIFICATION EMAIL ERROR:",
                repr(e),
            )

            # Delete account if email failed
            conn.execute(
                """
                DELETE FROM users
                WHERE id = %s
                """,
                (user_id,),
            )

            conn.commit()

            raise HTTPException(
                status_code=500,
                detail=(
                    "Account could not be created "
                    "because verification email failed"
                ),
            )

        return {
            "message": (
                "Account created successfully. "
                "Verification code sent to your email."
            ),
            "user_id": user_id,
            "email": email,
        }

    except HTTPException:
        raise

    except Exception as e:

        conn.rollback()

        print(
            "REGISTER ERROR:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail="Registration failed",
        )

    finally:
        conn.close()


# =========================================================
# RESEND VERIFICATION
# =========================================================

@router.post("/send-verification")
def send_verification(body: EmailBody):

    email = str(
        body.email
    ).lower().strip()

    conn = get_db()

    try:

        user = conn.execute(
            """
            SELECT id, is_verified
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

        if not user:

            raise HTTPException(
                status_code=404,
                detail="No account found with this email",
            )

        if user["is_verified"]:

            return {
                "message": "Email is already verified",
                "verified": True,
            }

        verification_code = generate_code()

        conn.execute(
            """
            UPDATE users
            SET verification_code = %s
            WHERE email = %s
            """,
            (
                verification_code,
                email,
            ),
        )

        conn.commit()

        try:

            send_verification_email(
                email,
                verification_code,
            )

        except Exception as e:

            print(
                "RESEND EMAIL ERROR:",
                repr(e),
            )

            raise HTTPException(
                status_code=500,
                detail="Verification email could not be sent",
            )

        return {
            "message": (
                "Verification code sent to your email"
            ),
            "email": email,
        }

    except HTTPException:
        raise

    except Exception as e:

        conn.rollback()

        print(
            "SEND VERIFICATION ERROR:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail="Could not send verification code",
        )

    finally:
        conn.close()


# =========================================================
# VERIFY EMAIL
# =========================================================

@router.post("/verify-email")
def verify_email(body: VerifyCodeBody):

    email = str(
        body.email
    ).lower().strip()

    code = body.code.strip()

    conn = get_db()

    try:

        user = conn.execute(
            """
            SELECT
                id,
                verification_code,
                is_verified
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

        if not user:

            raise HTTPException(
                status_code=404,
                detail="No account found with this email",
            )

        if user["is_verified"]:

            return {
                "message": "Email already verified",
                "verified": True,
            }

        if not user["verification_code"]:

            raise HTTPException(
                status_code=400,
                detail=(
                    "No verification code found. "
                    "Please request a new code."
                ),
            )

        if code != user["verification_code"]:

            raise HTTPException(
                status_code=400,
                detail="Invalid verification code",
            )

        conn.execute(
            """
            UPDATE users
            SET
                is_verified = 1,
                verification_code = NULL
            WHERE email = %s
            """,
            (email,),
        )

        conn.commit()

        return {
            "message": "Email verified successfully",
            "verified": True,
        }

    except HTTPException:
        raise

    except Exception as e:

        conn.rollback()

        print(
            "VERIFY EMAIL ERROR:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail="Email verification failed",
        )

    finally:
        conn.close()


# =========================================================
# LOGIN
# =========================================================

@router.post("/login")
def login(body: AuthBody):

    email = str(
        body.email
    ).lower().strip()

    conn = get_db()

    try:

        user = conn.execute(
            """
            SELECT *
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

    finally:
        conn.close()

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if not verify_password(
        body.password,
        user["password_hash"],
    ):

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if not user["is_verified"]:

        raise HTTPException(
            status_code=403,
            detail=(
                "Please verify your email "
                "before signing in"
            ),
        )

    return {
        "access_token": create_token(
            user["id"]
        ),
        "user_id": user["id"],
    }


# =========================================================
# FORGOT PASSWORD
# =========================================================

@router.post("/forgot-password")
def forgot_password(body: EmailBody):

    email = str(
        body.email
    ).lower().strip()

    conn = get_db()

    try:

        user = conn.execute(
            """
            SELECT id
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

        if not user:

            raise HTTPException(
                status_code=404,
                detail="No account found with this email",
            )

        reset_code = generate_code()

        conn.execute(
            """
            UPDATE users
            SET reset_code = %s
            WHERE email = %s
            """,
            (
                reset_code,
                email,
            ),
        )

        conn.commit()

        # -------------------------------------------------
        # SEND REAL EMAIL
        # -------------------------------------------------

        try:

            send_password_reset_email(
                email,
                reset_code,
            )

        except Exception as e:

            print(
                "PASSWORD RESET EMAIL ERROR:",
                repr(e),
            )

            raise HTTPException(
                status_code=500,
                detail=(
                    "Password reset email "
                    "could not be sent"
                ),
            )

        return {
            "message": (
                "Password reset code sent "
                "to your email"
            ),
            "email": email,
        }

    except HTTPException:
        raise

    except Exception as e:

        conn.rollback()

        print(
            "FORGOT PASSWORD ERROR:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail="Could not process password reset",
        )

    finally:
        conn.close()


# =========================================================
# VERIFY RESET CODE
# =========================================================

@router.post("/verify-reset-code")
def verify_reset_code(body: VerifyCodeBody):

    email = str(
        body.email
    ).lower().strip()

    code = body.code.strip()

    conn = get_db()

    try:

        user = conn.execute(
            """
            SELECT
                id,
                reset_code
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

        if not user:

            raise HTTPException(
                status_code=404,
                detail="No account found with this email",
            )

        if not user["reset_code"]:

            raise HTTPException(
                status_code=400,
                detail=(
                    "No reset code found. "
                    "Please request a new code."
                ),
            )

        if code != user["reset_code"]:

            raise HTTPException(
                status_code=400,
                detail="Invalid reset code",
            )

        return {
            "message": (
                "Reset code verified successfully"
            ),
            "verified": True,
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "VERIFY RESET CODE ERROR:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail="Could not verify reset code",
        )

    finally:
        conn.close()


# =========================================================
# RESET PASSWORD
# =========================================================

@router.post("/reset-password")
def reset_password(body: ResetPasswordBody):

    email = str(
        body.email
    ).lower().strip()

    code = body.code.strip()

    validate_password(
        body.new_password
    )

    conn = get_db()

    try:

        user = conn.execute(
            """
            SELECT
                id,
                reset_code
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

        if not user:

            raise HTTPException(
                status_code=404,
                detail="No account found with this email",
            )

        if not user["reset_code"]:

            raise HTTPException(
                status_code=400,
                detail=(
                    "No reset code found. "
                    "Please request a new code."
                ),
            )

        if code != user["reset_code"]:

            raise HTTPException(
                status_code=400,
                detail="Invalid reset code",
            )

        new_password_hash = hash_password(
            body.new_password
        )

        conn.execute(
            """
            UPDATE users
            SET
                password_hash = %s,
                reset_code = NULL
            WHERE email = %s
            """,
            (
                new_password_hash,
                email,
            ),
        )

        conn.commit()

        return {
            "message": (
                "Password reset successfully"
            ),
        }

    except HTTPException:
        raise

    except Exception as e:

        conn.rollback()

        print(
            "RESET PASSWORD ERROR:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail="Password reset failed",
        )

    finally:
        conn.close()