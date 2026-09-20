from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routes import auth, resume, jobs, applications

app = FastAPI(title="ApplyAI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://apply-job1.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(resume.router, prefix="/api/resume", tags=["resume"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(
    applications.router,
    prefix="/api/applications",
    tags=["applications"]
)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/")
def root():
    return {"app": "ApplyAI", "status": "running"}

@app.get("/health")
def health():
    return {"status": "ok"}
