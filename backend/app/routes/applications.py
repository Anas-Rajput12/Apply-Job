from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_db
from app.security import get_user_id

router = APIRouter()


class ApplicationBody(BaseModel):
    job_id: int | None = None
    job_title: str = ""
    company: str = ""
    job_url: str = ""
    match_score: float = 0
    status: str = "SAVED"
    cover_letter: str = ""
    notes: str = ""


@router.post("")
def create_application(
    body: ApplicationBody,
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO applications (
                    user_id,
                    job_id,
                    job_title,
                    company,
                    job_url,
                    match_score,
                    status,
                    cover_letter,
                    notes
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s
                )
                RETURNING id
                """,
                (
                    user_id,
                    body.job_id,
                    body.job_title,
                    body.company,
                    body.job_url,
                    body.match_score,
                    body.status,
                    body.cover_letter,
                    body.notes
                )
            )

            application_id = cur.fetchone()["id"]

        conn.commit()

        return {
            "id": application_id,
            "message": "Application saved successfully"
        }

    except Exception as exc:
        conn.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Failed to save application: {exc}"
        )

    finally:
        conn.close()


@router.get("")
def get_applications(
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    job_id,
                    job_title,
                    company,
                    job_url,
                    match_score,
                    status,
                    cover_letter,
                    notes,
                    created_at
                FROM applications
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,)
            )

            applications = cur.fetchall()

        return applications

    finally:
        conn.close()


@router.get("/{application_id}")
def get_application(
    application_id: int,
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    job_id,
                    job_title,
                    company,
                    job_url,
                    match_score,
                    status,
                    cover_letter,
                    notes,
                    created_at
                FROM applications
                WHERE id = %s
                AND user_id = %s
                """,
                (application_id, user_id)
            )

            application = cur.fetchone()

        if not application:
            raise HTTPException(
                status_code=404,
                detail="Application not found"
            )

        return application

    finally:
        conn.close()
