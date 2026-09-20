import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_db
from app.security import get_user_id
from app.services.ai import analyze_job, generate_cover_letter


router = APIRouter()


# --------------------------------------------------
# Request Models
# --------------------------------------------------

class AnalyzeBody(BaseModel):
    resume_id: int
    job_description: str
    title: str = ""
    company: str = ""
    url: str = ""


class CoverLetterBody(BaseModel):
    resume_id: int
    job_description: str
    company: str = ""


# --------------------------------------------------
# Analyze Job
# --------------------------------------------------

@router.post("/analyze")
async def analyze(
    body: AnalyzeBody,
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    try:
        # Get resume belonging to current user
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, filename, text
                FROM resumes
                WHERE id = %s
                AND user_id = %s
                """,
                (body.resume_id, user_id)
            )

            resume = cur.fetchone()

    finally:
        conn.close()

    if not resume:
        raise HTTPException(
            status_code=404,
            detail="Resume not found"
        )

    cv_text = resume["text"]

    if not cv_text:
        raise HTTPException(
            status_code=400,
            detail="Resume text is empty"
        )

    if not body.job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Job description is required"
        )

    # --------------------------------------------------
    # AI Analysis
    # --------------------------------------------------

    result = await analyze_job(
        cv=cv_text,
        job=body.job_description
    )

    # --------------------------------------------------
    # Save job analysis to PostgreSQL
    # --------------------------------------------------

    conn = get_db()

    try:
        analysis_json = json.dumps(result)

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jobs (
                    user_id,
                    title,
                    company,
                    url,
                    description,
                    analysis_json
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    user_id,
                    body.title,
                    body.company,
                    body.url,
                    body.job_description,
                    analysis_json
                )
            )

            job_id = cur.fetchone()["id"]

        conn.commit()

    except Exception:
        conn.rollback()
        raise

    finally:
        conn.close()

    return {
        "job_id": job_id,
        "analysis": result
    }


# --------------------------------------------------
# Generate Cover Letter
# --------------------------------------------------

@router.post("/cover-letter")
async def cover_letter(
    body: CoverLetterBody,
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, filename, text
                FROM resumes
                WHERE id = %s
                AND user_id = %s
                """,
                (body.resume_id, user_id)
            )

            resume = cur.fetchone()

    finally:
        conn.close()

    if not resume:
        raise HTTPException(
            status_code=404,
            detail="Resume not found"
        )

    cv_text = resume["text"]

    if not cv_text:
        raise HTTPException(
            status_code=400,
            detail="Resume text is empty"
        )

    if not body.job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Job description is required"
        )

    # --------------------------------------------------
    # Generate Cover Letter
    # --------------------------------------------------

    result = await generate_cover_letter(
        cv=cv_text,
        job=body.job_description,
        company=body.company
    )

    return {
        "cover_letter": result
    }


# --------------------------------------------------
# Get User's Saved Jobs
# --------------------------------------------------

@router.get("")
def get_jobs(
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    title,
                    company,
                    url,
                    description,
                    analysis_json,
                    created_at
                FROM jobs
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,)
            )

            jobs = cur.fetchall()

    finally:
        conn.close()

    result = []

    for job in jobs:

        analysis = None

        if job["analysis_json"]:
            try:
                analysis = json.loads(
                    job["analysis_json"]
                )
            except Exception:
                analysis = None

        result.append(
            {
                "id": job["id"],
                "title": job["title"],
                "company": job["company"],
                "url": job["url"],
                "description": job["description"],
                "analysis": analysis,
                "created_at": job["created_at"]
            }
        )

    return result


# --------------------------------------------------
# Get Single Job
# --------------------------------------------------

@router.get("/{job_id}")
def get_job(
    job_id: int,
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    title,
                    company,
                    url,
                    description,
                    analysis_json,
                    created_at
                FROM jobs
                WHERE id = %s
                AND user_id = %s
                """,
                (job_id, user_id)
            )

            job = cur.fetchone()

    finally:
        conn.close()

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    analysis = None

    if job["analysis_json"]:
        try:
            analysis = json.loads(
                job["analysis_json"]
            )
        except Exception:
            analysis = None

    return {
        "id": job["id"],
        "title": job["title"],
        "company": job["company"],
        "url": job["url"],
        "description": job["description"],
        "analysis": analysis,
        "created_at": job["created_at"]
    }
