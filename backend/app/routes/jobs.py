from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from openai import OpenAI
import os
import json

from app.security import get_user_id

router = APIRouter()

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

MODEL_NAME = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o")


class JobAnalyzeBody(BaseModel):
    resume_text: str = ""
    job_description: str = ""
    title: str = ""
    company: str = ""
    url: str = ""


class CoverLetterBody(BaseModel):
    resume_text: str
    job_description: str
    full_name: str = ""
    phone: str = ""
    email: str = ""
    linkedin: str = ""
    address: str = ""


@router.post("/analyze")
def analyze_job(
    body: JobAnalyzeBody,
    user_id: int = Depends(get_user_id),
):

    if not body.job_description.strip():
        raise HTTPException(status_code=400, detail="Job description is required")

    system_prompt = f"""
You are an expert recruiter and resume analyst.

Compare the applicant's resume against the job description and
return ONLY a JSON object (no markdown, no backticks, no preamble)
with this exact shape:

{{
  "title": "job title extracted from the description",
  "company": "company name extracted from the description, or empty string if unknown",
  "match_score": number from 0 to 100,
  "summary": "2-3 sentence overview of fit",
  "strengths": ["short strength 1", "short strength 2", ...],
  "missing_skills": ["short missing skill 1", "short missing skill 2", ...]
}}

RESUME:
{body.resume_text}

JOB DESCRIPTION:
{body.job_description}
""".strip()

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "system", "content": system_prompt}],
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        analysis = json.loads(response.choices[0].message.content)
    except Exception as e:
        print("JOB ANALYSIS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail="Job analysis failed")

    return {"analysis": analysis}


@router.post("/cover-letter")
def generate_cover_letter(
    body: CoverLetterBody,
    user_id: int = Depends(get_user_id),
):

    if not body.resume_text.strip():
        raise HTTPException(status_code=400, detail="Resume text is required")

    if not body.job_description.strip():
        raise HTTPException(status_code=400, detail="Job description is required")

    contact_lines = []
    if body.full_name.strip():
        contact_lines.append(f"Full name: {body.full_name.strip()}")
    if body.phone.strip():
        contact_lines.append(f"Phone: {body.phone.strip()}")
    if body.email.strip():
        contact_lines.append(f"Email: {body.email.strip()}")
    if body.linkedin.strip():
        contact_lines.append(f"LinkedIn: {body.linkedin.strip()}")
    if body.address.strip():
        contact_lines.append(f"Address: {body.address.strip()}")

    contact_block = "\n".join(contact_lines) if contact_lines else "No contact details were provided."

    system_prompt = f"""
You are an expert cover letter writer.

Write a professional, ATS-friendly cover letter based on the
applicant's resume and the job description below.

APPLICANT CONTACT INFORMATION (use these EXACT values, do not
invent, alter, or omit any that are provided):
{contact_block}

FORMAT RULES:
1. Start the letter with the contact information above, each on
   its own line (only include lines that were actually provided).
2. Leave one blank line, then today's date.
3. Leave one blank line, then "Dear Hiring Manager," (or
   "Dear [Company] Hiring Team," if the company name is clear
   from the job description).
4. Write 3-4 paragraphs connecting the applicant's real experience
   and skills (from the resume) to the job requirements.
5. Close with "Sincerely," followed by the applicant's full name
   on its own line (use the exact name given above, or omit the
   closing name if no name was provided).

CONTENT RULES:
- Only use experience, skills, and education that actually appear
  in the resume text below. Do not invent employers, degrees, or
  achievements.
- Do not use placeholder brackets like [Your Name] or [Phone] —
  use the real values given above, or omit that line entirely if
  a value wasn't provided.
- Keep it concise: 300-400 words for the body.

RESUME:
{body.resume_text}

JOB DESCRIPTION:
{body.job_description}
""".strip()

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "system", "content": system_prompt}],
            temperature=0.6,
        )
        letter = response.choices[0].message.content.strip()
    except Exception as e:
        print("COVER LETTER GENERATION ERROR:", repr(e))
        raise HTTPException(status_code=500, detail="Cover letter generation failed")

    return {"cover_letter": letter}