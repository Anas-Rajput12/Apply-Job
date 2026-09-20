```python
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
    # Resume
    resume_id: int | None = None
    resume_text: str | None = None

    # Job description
    job_description: str | None = None

    # Optional job information
    title: str = ""
    company: str = ""
    url: str = ""

    # Frontend compatibility
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


class CoverLetterBody(BaseModel):
    # Resume
    resume_id: int | None = None
    resume_text: str | None = None

    # Job description
    job_description: str | None = None

    # Optional
    company: str = ""
    title: str = ""
    url: str = ""

    # Frontend compatibility
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
# HELPER: GET RESUME TEXT
# ============================================================

def get_resume_text(
    resume_id: int | None,
    resume_text: str | None,
    user_id: int
) -> str:

    # --------------------------------------------------------
    # Option 1: Frontend directly sends resume_text
    # --------------------------------------------------------

    if resume_text and resume_text.strip():
        return resume_text.strip()

    # --------------------------------------------------------
    # Option 2: Frontend sends resume_id
    # --------------------------------------------------------

    if resume_id:

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

        if not resume:
            raise HTTPException(
                status_code=404,
                detail="Resume not found"
            )

        text = resume["text"]

        if not text:
            raise HTTPException(
                status_code=400,
                detail="Resume text is empty"
            )

        return text.strip()

    # --------------------------------------------------------
    # No resume provided
    # --------------------------------------------------------

    raise HTTPException(
        status_code=400,
        detail="resume_text or resume_id is required"
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
    # Get job description
    # --------------------------------------------------------

    job_description = body.get_job_description()

    if not job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="job_description is required"
        )

    # --------------------------------------------------------
    # Get resume
    # --------------------------------------------------------

    resume_id = body.get_resume_id()

    cv_text = get_resume_text(
        resume_id=resume_id,
        resume_text=body.resume_text,
        user_id=user_id
    )

    # --------------------------------------------------------
    # AI Analysis
    # --------------------------------------------------------

    result = await analyze_job(
        cv=cv_text,
        job=job_description
    )

    # --------------------------------------------------------
    # Save job + analysis
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
    # Response
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
    # Get job description
    # --------------------------------------------------------

    job_description = body.get_job_description()

    if not job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="job_description is required"
        )

    # --------------------------------------------------------
    # Get resume
    # --------------------------------------------------------

    resume_id = body.get_resume_id()

    cv_text = get_resume_text(
        resume_id=resume_id,
        resume_text=body.resume_text,
        user_id=user_id
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
```
