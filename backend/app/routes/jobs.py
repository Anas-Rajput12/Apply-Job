import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db import get_db
from app.security import get_user_id
from app.services.ai import analyze_job, generate_cover_letter

router = APIRouter()

class JobBody(BaseModel):
    resume_text: str
    job_description: str
    title: str = ""
    company: str = ""
    url: str = ""

@router.post("/analyze")
async def analyze(
    body: JobBody,
    user_id: int = Depends(get_user_id)
):
    result = await analyze_job(
        body.resume_text,
        body.job_description
    )

    conn = get_db()

    cur = conn.execute(
        """INSERT INTO jobs
        (user_id, title, company, url, description, analysis_json)
        VALUES (?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            body.title,
            body.company,
            body.url,
            body.job_description,
            json.dumps(result)
        )
    )

    conn.commit()
    conn.close()

    return {
        "job_id": cur.lastrowid,
        **result
    }

@router.post("/cover-letter")
async def cover_letter(
    body: JobBody,
    user_id: int = Depends(get_user_id)
):
    letter = await generate_cover_letter(
        body.resume_text,
        body.job_description,
        body.company
    )

    return {"cover_letter": letter}
