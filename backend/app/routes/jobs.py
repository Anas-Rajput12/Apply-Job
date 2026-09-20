import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_db
from app.security import get_user_id
from app.services.ai import analyze_job, generate_cover_letter


router = APIRouter()


# ============================================================
# REQUEST MODELS
# ============================================================

class AnalyzeBody(BaseModel):
    # Standard backend fields
    resume_id: int | None = None
    job_description: str | None = None

    # Optional job information
    title: str = ""
    company: str = ""
    url: str = ""

    # Support frontend camelCase fields
    resumeId: int | None = None
    jobDescription: str | None = None

    # Support simple "job" field
    job: str | None = None

    def get_resume_id(self):
        return self.resume_id or self.resumeId

    def get_job_description(self):
        return (
            self.job_description
            or self.jobDescription
            or self.job
            or ""
        )


class CoverLetterBody(BaseModel):
    resume_id: int | None = None
    job_description: str | None = None
    company: str = ""

    resumeId: int | None = None
    jobDescription: str | None = None
    job: str | None = None

    def get_resume_id(self):
        return self.resume_id or self.resumeId

    def get_job_description(self):
        return (
            self.job_description
            or self.jobDescription
            or self.job
            or ""
        )


# ============================================================
# ANALYZE JOB
# ============================================================

@router.post("/analyze")
async def analyze(
    body: AnalyzeBody,
    user_id: int = Depends(get_user_id)
):

    # --------------------------------------------------------
    # Get normalized values
    # --------------------------------------------------------

    resume_id = body.get_resume_id()
    job_description = body.get_job_description()

    # --------------------------------------------------------
    # Validate resume ID
    # --------------------------------------------------------

    if not resume_id:
        raise HTTPException(
            status_code=400,
            detail="resume_id is required"
        )

    # --------------------------------------------------------
    # Validate job description
    # --------------------------------------------------------

    if not job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="job_description is required"
        )

    # --------------------------------------------------------
    # Get resume from PostgreSQL
    # --------------------------------------------------------

    conn = get_db()

    try:
        with conn.cursor() as cur:

            cur.execute(
                """
                SELECT
                    id,
                    filename,
                    text
                FROM resumes
                WHERE id = %s
                AND user_id = %s
                """,
                (
                    resume_id,
                    user_id
                )
            )

            resume = cur.fetchone()

    finally:
        conn.close()

    # --------------------------------------------------------
    # Resume not found
    # --------------------------------------------------------

    if not resume:
        raise HTTPException(
            status_code=404,
            detail="Resume not found"
        )

    # --------------------------------------------------------
    # Resume text
    # --------------------------------------------------------

    cv_text = resume["text"]

    if not cv_text:
        raise HTTPException(
            status_code=400,
            detail="Resume text is empty"
        )

    # --------------------------------------------------------
    # Analyze using AI
    # --------------------------------------------------------

    result = await analyze_job(
        cv=cv_text,
        job=job_description
    )

    # --------------------------------------------------------
    # Save result to PostgreSQL
    # --------------------------------------------------------

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
                VALUES (
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
                    body.title,
                    body.company,
                    body.url,
                    job_description,
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

    # --------------------------------------------------------
    # Return result
    # --------------------------------------------------------

    return {
        "job_id": job_id,
        "analysis": result
    }


# ============================================================
# GENERATE COVER LETTER
# ============================================================

@router.post("/cover-letter")
async def cover_letter(
    body: CoverLetterBody,
    user_id: int = Depends(get_user_id)
):

    # --------------------------------------------------------
    # Normalize values
    # --------------------------------------------------------

    resume_id = body.get_resume_id()
    job_description = body.get_job_description()

    # --------------------------------------------------------
    # Validate
    # --------------------------------------------------------

    if not resume_id:
        raise HTTPException(
            status_code=400,
            detail="resume_id is required"
        )

    if not job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="job_description is required"
        )

    # --------------------------------------------------------
    # Get resume
    # --------------------------------------------------------

    conn = get_db()

    try:
        with conn.cursor() as cur:

            cur.execute(
                """
                SELECT
                    id,
                    filename,
                    text
                FROM resumes
                WHERE id = %s
                AND user_id = %s
                """,
                (
                    resume_id,
                    user_id
                )
            )

            resume = cur.fetchone()

    finally:
        conn.close()

    # --------------------------------------------------------
    # Resume not found
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Generate cover letter
    # --------------------------------------------------------

    result = await generate_cover_letter(
        cv=cv_text,
        job=job_description,
        company=body.company
    )

    return {
        "cover_letter": result
    }


# ============================================================
# GET ALL SAVED JOBS
# ============================================================

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


# ============================================================
# GET SINGLE JOB
# ============================================================

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
                (
                    job_id,
                    user_id
                )
            )

            job = cur.fetchone()

    finally:
        conn.close()

    # --------------------------------------------------------
    # Job not found
    # --------------------------------------------------------

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    # --------------------------------------------------------
    # Parse analysis
    # --------------------------------------------------------

    analysis = None

    if job["analysis_json"]:

        try:
            analysis = json.loads(
                job["analysis_json"]
            )

        except Exception:
            analysis = None

    # --------------------------------------------------------
    # Return job
    # --------------------------------------------------------

    return {
        "id": job["id"],
        "title": job["title"],
        "company": job["company"],
        "url": job["url"],
        "description": job["description"],
        "analysis": analysis,
        "created_at": job["created_at"]
    }
