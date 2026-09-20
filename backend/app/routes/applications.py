from fastapi import APIRouter, Depends
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

    cur = conn.execute(
        """INSERT INTO applications
        (user_id, job_id, job_title, company, job_url,
         match_score, status, cover_letter, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            body.job_id,
            body.job_title,
            body.company,
            body.job_url,
            body.match_score,
            body.status.upper(),
            body.cover_letter,
            body.notes
        )
    )

    conn.commit()
    conn.close()

    return {
        "id": cur.lastrowid,
        "message": "Application saved"
    }

@router.get("")
def list_applications(
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    rows = conn.execute(
        """SELECT * FROM applications
        WHERE user_id = ?
        ORDER BY id DESC""",
        (user_id,)
    ).fetchall()

    conn.close()

    return [dict(row) for row in rows]

@router.patch("/{application_id}/status")
def update_status(
    application_id: int,
    status: str,
    user_id: int = Depends(get_user_id)
):
    conn = get_db()

    cur = conn.execute(
        """UPDATE applications
        SET status = ?
        WHERE id = ? AND user_id = ?""",
        (status.upper(), application_id, user_id)
    )

    conn.commit()
    conn.close()

    if cur.rowcount == 0:
        return {"message": "Application not found"}

    return {"message": "Status updated"}
