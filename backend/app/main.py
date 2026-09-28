from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routes import auth, resume, jobs, applications


app = FastAPI(
    title="ApplyAI API",
    version="1.0.0"
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

ALLOWED_ORIGINS = [
    # Production frontend
    "https://apply-job-xp27.vercel.app//",

    # Local development
    "http://localhost:3000",
    "http://127.0.0.1:3000",

    # Expo / React Native web
    "http://localhost:8081",
    "http://127.0.0.1:8081",

    # Expo web alternative ports
    "http://localhost:19006",
    "http://127.0.0.1:19006",
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Routes
# --------------------------------------------------

app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["auth"]
)

app.include_router(
    resume.router,
    prefix="/api/resume",
    tags=["resume"]
)

app.include_router(
    jobs.router,
    prefix="/api/jobs",
    tags=["jobs"]
)

app.include_router(
    applications.router,
    prefix="/api/applications",
    tags=["applications"]
)


# --------------------------------------------------
# Startup
# --------------------------------------------------

@app.on_event("startup")
def startup():
    init_db()


# --------------------------------------------------
# Root
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "app": "ApplyAI",
        "status": "running"
    }


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok"
    }
