import json
import os
import httpx

URL = os.getenv(
    "OPENROUTER_URL",
    "https://openrouter.ai/api/v1/chat/completions"
)
KEY = os.getenv("OPENROUTER_API_KEY", "")
MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b")

def demo_analysis(cv: str, job: str) -> dict:
    cv_lower = cv.lower()
    job_lower = job.lower()

    skills = [
        "python", "react", "next.js", "typescript", "javascript",
        "fastapi", "postgresql", "sql", "docker", "aws", "git",
        "ai", "llm", "firebase", "supabase"
    ]

    required = [skill for skill in skills if skill in job_lower]
    matched = [skill for skill in required if skill in cv_lower]
    missing = [skill for skill in required if skill not in cv_lower]

    score = round((len(matched) / max(len(required), 1)) * 100, 1)

    return {
        "match_score": score,
        "required_skills": required,
        "matched_skills": matched,
        "missing_skills": missing,
        "experience_match": "Review required",
        "education_match": "Review required",
        "ats_keywords": required,
        "strengths": matched[:5],
        "weaknesses": missing[:5],
        "recommendation": "Apply" if score >= 60 else "Consider skill gap first",
        "mode": "demo"
    }

async def analyze_job(cv: str, job: str) -> dict:
    if not KEY:
        return demo_analysis(cv, job)

    prompt = f"""
You are an honest job application assistant.

Compare the candidate CV with the job description.

Rules:
- Never invent experience.
- Never invent education.
- Never invent skills.
- Never invent employers, dates or achievements.
- Return ONLY valid JSON.

Required JSON keys:
match_score
required_skills
matched_skills
missing_skills
experience_match
education_match
ats_keywords
strengths
weaknesses
recommendation

CV:
{cv[:12000]}

JOB DESCRIPTION:
{job[:12000]}
"""

    headers = {
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
    }

    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }

    async with httpx.AsyncClient(timeout=90) as client:
    response = await client.post(URL, headers=headers, json=body)

    if response.status_code != 200:
        print("OPENROUTER STATUS:", response.status_code)
        print("OPENROUTER RESPONSE:", response.text)

    response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"].strip()

    if content.startswith("```"):
        content = content.replace("```json", "").replace("```", "").strip()

    return json.loads(content)

async def generate_cover_letter(cv: str, job: str, company: str = "") -> str:
    if not KEY:
        return f"""Dear Hiring Team at {company or 'the company'},

I am writing to express my interest in the position. My background and project
experience align with the requirements of this opportunity. Please review my
attached CV for details about my skills and experience.

I would welcome the opportunity to discuss how I can contribute to your team.

Sincerely,
Candidate"""

    prompt = f"""
Write a concise, professional cover letter.

Use ONLY facts contained in the CV.
Do not invent experience, qualifications, employers, projects or achievements.

Company: {company}

CV:
{cv[:10000]}

JOB DESCRIPTION:
{job[:10000]}
"""

    headers = {
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
    }

    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.4,
    }

    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(URL, headers=headers, json=body)
        response.raise_for_status()

    return response.json()["choices"][0]["message"]["content"]
