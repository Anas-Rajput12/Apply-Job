import os
import psycopg
from psycopg.rows import dict_row


DATABASE_URL = os.getenv("DATABASE_URL")


def get_db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    conn = psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row
    )

    return conn


def init_db():
    conn = get_db()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS resumes (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    filename TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    title TEXT DEFAULT '',
                    company TEXT DEFAULT '',
                    url TEXT DEFAULT '',
                    description TEXT NOT NULL,
                    analysis_json TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS applications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    job_id INTEGER,
                    job_title TEXT DEFAULT '',
                    company TEXT DEFAULT '',
                    job_url TEXT DEFAULT '',
                    match_score REAL DEFAULT 0,
                    status TEXT DEFAULT 'SAVED',
                    cover_letter TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

        conn.commit()

    finally:
        conn.close()
