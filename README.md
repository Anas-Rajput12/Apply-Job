# ApplyAI — AI Job Application Agent

A working MVP starter for an AI-powered job application assistant.

## Features
- React Native + Expo mobile app
- FastAPI backend
- Register / Login with JWT
- PDF CV upload and text extraction
- Job description analysis
- Match score, matched/missing skills and ATS keywords
- AI cover letter generation
- Application tracker
- OpenRouter integration
- Demo AI fallback when no API key is configured
- SQLite database for zero-cost local development

## 1. Backend — Windows

Open Terminal in `backend`:

```bat
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs:
http://localhost:8000/docs

## 2. Mobile

Open a second terminal in `mobile`:

```bat
npm install
npx expo start
```

Install Expo Go on your Android phone and scan the QR code.

### Physical phone
Open `mobile/src/config.ts` and replace:

```text
http://localhost:8000
```

with your computer LAN IP, for example:

```text
http://192.168.1.10:8000
```

Both phone and PC must be on the same Wi-Fi network.

## 3. OpenRouter

Copy `.env.example` to `.env` and set:

```text
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=your_model
```

If the key is empty, the app automatically uses a local demo analyzer so you can test the complete flow without an AI API.

## Important
This is an MVP starter. Before production, add stronger validation, secure secrets, rate limiting, file-size limits, proper user profile management, cloud storage, PostgreSQL/Supabase, and production authentication.
