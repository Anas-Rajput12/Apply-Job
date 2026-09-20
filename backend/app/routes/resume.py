import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException

from app.db import get_db
from app.security import get_user_id
from app.services.resume_parser import extract_pdf_text

router = APIRouter()

@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    user_id: int = Depends(get_user_id)
):
    filename = file.filename or ""

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    data = await file.read()

    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "PDF must be smaller than 10 MB")

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".pdf"
    ) as tmp:
        tmp.write(data)
        path = tmp.name

    try:
        text = extract_pdf_text(path)
    except Exception as exc:
        raise HTTPException(400, f"Could not read PDF: {exc}")
    finally:
        os.unlink(path)

    if not text:
        raise HTTPException(
            400,
            "No text found in PDF. Scanned/image-only PDFs need OCR."
        )

    conn = get_db()

    cur = conn.execute(
        "INSERT INTO resumes(user_id, filename, text) VALUES(?, ?, ?)",
        (user_id, filename, text)
    )

    conn.commit()
    conn.close()

    return {
        "resume_id": cur.lastrowid,
        "filename": filename,
        "text": text
    }
