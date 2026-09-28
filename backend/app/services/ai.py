import json
import os

import httpx
from fastapi import HTTPException


# --------------------------------------------------
# OpenRouter Configuration
# --------------------------------------------------

URL = os.getenv(
    "OPENROUTER_URL",
    "https://openrouter.ai/api/v1/chat/completions"
)

KEY = os.getenv("OPENROUTER_API_KEY", "")

MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "openrouter/free"
)


# --------------------------------------------------
# Demo / Fallback Analysis
# --------------------------------------------------

def demo_analysis(cv: str, job: str) -> dict:
    cv_lower = cv.lower()
    job_lower = job.lower()

    skills = [
        "python",
        "react",
        "next.js",
        "typescript",
        "javascript",
        "fastapi",
        "postgresql",
        "sql",
        "docker",
        "aws",
        "git",
        "ai",
        "llm",
        "firebase",
        "supabase"
    ]

    required = [
        skill
        for skill in skills
        if skill in job_lower
    ]

    matched = [
        skill
        for skill in required
        if skill in cv_lower
    ]

    missing = [
        skill
        for skill in required
        if skill not in cv_lower
    ]

    score = round(
        (len(matched) / max(len(required), 1)) * 100,
        1
    )

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
        "recommendation": (
            "Apply"
            if score >= 60
            else "Consider skill gap first"
        ),
        "mode": "demo"
    }


# --------------------------------------------------
# Analyze Job
# --------------------------------------------------

async def analyze_job(cv: str, job: str) -> dict:

    # If OpenRouter key is missing,
    # use local fallback analysis.
    if not KEY:
        return demo_analysis(cv, job)

    prompt = f"""
You are an honest job application assistant.

Compare the candidate CV with the job description.

Rules:
- Never invent experience.
- Never invent education.
- Never invent skills.
- Never invent employers.
- Never invent dates.
- Never invent achievements.
- Only use information available in the CV.
- Return ONLY valid JSON.
- Do not use Markdown.
- Keep the response concise.
- match_score must be a number from 0 to 100.
- Every skill must be returned as a simple string.
- All array fields must always be arrays, even when empty.

Required JSON structure:

{{
    "match_score": 0,
    "required_skills": [],
    "matched_skills": [],
    "missing_skills": [],
    "experience_match": "",
    "education_match": "",
    "ats_keywords": [],
    "strengths": [],
    "weaknesses": [],
    "recommendation": ""
}}

Important:
- required_skills = skills required by the job.
- matched_skills = required skills that are clearly present in the CV.
- missing_skills = required skills that are not clearly present in the CV.
- ats_keywords = important keywords from the job description that are relevant for ATS.
- strengths = relevant strengths supported by the CV.
- weaknesses = relevant gaps supported by the comparison.
- recommendation should be a short factual recommendation based only on the comparison.

CV:
{cv[:8000]}

JOB DESCRIPTION:
{job[:8000]}
"""

    headers = {
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://apply-job1.vercel.app",
        "X-OpenRouter-Title": "ApplyAI"
    }

    body = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.2,
        "max_tokens": 2000
    }

    # --------------------------------------------------
    # Send request to OpenRouter
    # --------------------------------------------------

    try:

        async with httpx.AsyncClient(
            timeout=90
        ) as client:

            response = await client.post(
                URL,
                headers=headers,
                json=body
            )

    except httpx.RequestError as exc:

        raise HTTPException(
            status_code=502,
            detail={
                "message": "Could not connect to OpenRouter",
                "error": str(exc)
            }
        )

    # --------------------------------------------------
    # Handle OpenRouter errors
    # --------------------------------------------------

    if response.status_code != 200:

        try:
            error_data = response.json()

        except Exception:
            error_data = response.text

        print(
            "OPENROUTER STATUS:",
            response.status_code
        )

        print(
            "OPENROUTER RESPONSE:",
            error_data
        )

        raise HTTPException(
            status_code=502,
            detail={
                "message": "OpenRouter API request failed",
                "status_code": response.status_code,
                "response": error_data
            }
        )

    # --------------------------------------------------
    # Parse OpenRouter response
    # --------------------------------------------------

    try:

        data = response.json()

        content = (
            data["choices"][0]["message"]["content"]
            .strip()
        )

    except (
        KeyError,
        IndexError,
        TypeError,
        json.JSONDecodeError
    ) as exc:

        print(
            "OPENROUTER INVALID RESPONSE:",
            response.text
        )

        raise HTTPException(
            status_code=502,
            detail={
                "message": "Invalid response from OpenRouter",
                "error": str(exc)
            }
        )

    # --------------------------------------------------
    # Remove Markdown JSON fences
    # --------------------------------------------------

    if content.startswith("```"):

        content = content.replace(
            "```json",
            ""
        )

        content = content.replace(
            "```",
            ""
        )

        content = content.strip()

    # --------------------------------------------------
    # Parse AI JSON
    # --------------------------------------------------

    try:

        result = json.loads(content)

        # --------------------------------------------------
        # Normalize AI response
        # --------------------------------------------------

        required_skills = result.get(
            "required_skills",
            []
        )

        if not isinstance(required_skills, list):
            required_skills = []

        matched_skills = result.get(
            "matched_skills",
            []
        )

        missing_skills = result.get(
            "missing_skills",
            []
        )

        ats_keywords = result.get(
            "ats_keywords",
            []
        )

        # --------------------------------------------------
        # Convert invalid values to lists
        # --------------------------------------------------

        if not isinstance(matched_skills, list):
            matched_skills = []

        if not isinstance(missing_skills, list):
            missing_skills = []

        if not isinstance(ats_keywords, list):
            ats_keywords = []

        # --------------------------------------------------
        # Calculate matched skills if AI didn't provide them
        # --------------------------------------------------

        if not matched_skills:

            matched_skills = [
                skill
                for skill in required_skills
                if str(skill).lower() in cv.lower()
            ]

        # --------------------------------------------------
        # Calculate missing skills if AI didn't provide them
        # --------------------------------------------------

        if not missing_skills:

            missing_skills = [
                skill
                for skill in required_skills
                if str(skill).lower() not in cv.lower()
            ]

        # --------------------------------------------------
        # Use required skills as ATS keywords
        # if AI didn't return keywords
        # --------------------------------------------------

        if not ats_keywords:

            ats_keywords = required_skills

        # --------------------------------------------------
        # Make sure match score exists
        # --------------------------------------------------

        match_score = result.get(
            "match_score",
            0
        )

        try:
            match_score = float(match_score)
        except (TypeError, ValueError):
            match_score = 0

        # --------------------------------------------------
        # Make sure recommendation exists
        # --------------------------------------------------

        recommendation = result.get(
            "recommendation",
            ""
        )

        if not recommendation:

            recommendation = (
                "Apply"
                if match_score >= 60
                else "Consider skill gap first"
            )

        # --------------------------------------------------
        # Make sure strengths and weaknesses exist
        # --------------------------------------------------

        strengths = result.get(
            "strengths",
            []
        )

        weaknesses = result.get(
            "weaknesses",
            []
        )

        if not isinstance(strengths, list):
            strengths = []

        if not isinstance(weaknesses, list):
            weaknesses = []

        if not strengths:
            strengths = matched_skills[:5]

        if not weaknesses:
            weaknesses = missing_skills[:5]

        # --------------------------------------------------
        # Final normalized response
        # --------------------------------------------------

        result["match_score"] = match_score
        result["required_skills"] = required_skills
        result["matched_skills"] = matched_skills
        result["missing_skills"] = missing_skills
        result["ats_keywords"] = ats_keywords
        result["strengths"] = strengths
        result["weaknesses"] = weaknesses
        result["recommendation"] = recommendation

        # Make sure these fields always exist
        result["experience_match"] = result.get(
            "experience_match",
            "Review required"
        )

        result["education_match"] = result.get(
            "education_match",
            "Review required"
        )

        result["mode"] = "openrouter"

        print(
            "FINAL AI ANALYSIS:",
            json.dumps(
                result,
                indent=2
            )
        )

        return result

    except json.JSONDecodeError as exc:

        print(
            "INVALID AI JSON:",
            content
        )

        raise HTTPException(
            status_code=502,
            detail={
                "message": "AI returned invalid JSON",
                "error": str(exc),
                "raw_response": content[:3000]
            }
        )


# --------------------------------------------------
# Generate Cover Letter
# --------------------------------------------------

async def generate_cover_letter(
    cv: str,
    job: str,
    company: str = ""
) -> str:

    # --------------------------------------------------
    # Fallback cover letter
    # --------------------------------------------------

    if not KEY:

        return f"""Dear Hiring Team at {company or 'the company'},

I am writing to express my interest in the position. My background and project experience align with the requirements of this opportunity. Please review my attached CV for details about my skills and experience.

I would welcome the opportunity to discuss how I can contribute to your team.

Sincerely,
Candidate"""

    prompt = f"""
Write a concise and professional cover letter.

Use ONLY facts contained in the CV.

Do not invent:
- experience
- qualifications
- employers
- projects
- achievements
- dates
- skills

Company:
{company}

CV:
{cv[:6000]}

JOB DESCRIPTION:
{job[:6000]}
"""

    headers = {
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://apply-job1.vercel.app",
        "X-OpenRouter-Title": "ApplyAI"
    }

    body = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.4,
        "max_tokens": 1500
    }

    # --------------------------------------------------
    # Send request to OpenRouter
    # --------------------------------------------------

    try:

        async with httpx.AsyncClient(
            timeout=90
        ) as client:

            response = await client.post(
                URL,
                headers=headers,
                json=body
            )

    except httpx.RequestError as exc:

        raise HTTPException(
            status_code=502,
            detail={
                "message": "Could not connect to OpenRouter",
                "error": str(exc)
            }
        )

    # --------------------------------------------------
    # Handle errors
    # --------------------------------------------------

    if response.status_code != 200:

        try:
            error_data = response.json()

        except Exception:
            error_data = response.text

        print(
            "OPENROUTER COVER LETTER STATUS:",
            response.status_code
        )

        print(
            "OPENROUTER COVER LETTER RESPONSE:",
            error_data
        )

        raise HTTPException(
            status_code=502,
            detail={
                "message": "OpenRouter API request failed",
                "status_code": response.status_code,
                "response": error_data
            }
        )

    # --------------------------------------------------
    # Parse response
    # --------------------------------------------------

    try:

        data = response.json()

        return (
            data["choices"][0]["message"]["content"]
            .strip()
        )

    except (
        KeyError,
        IndexError,
        TypeError,
        json.JSONDecodeError
    ) as exc:

        print(
            "OPENROUTER COVER LETTER INVALID RESPONSE:",
            response.text
        )

        raise HTTPException(
            status_code=502,
            detail={
                "message": "Invalid cover letter response",
                "error": str(exc)
            }
        )
