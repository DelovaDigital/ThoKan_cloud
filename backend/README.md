# Backend

FastAPI backend for authentication, file management, sharing, permissions, audit logs, and admin APIs.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Key Routes

- `/api/v1/auth/*`
- `/api/v1/files/*`
- `/api/v1/folders/*`
- `/api/v1/permissions/*`
- `/api/v1/sharing/*`
- `/api/v1/dashboard`
- `/api/v1/admin/*`
