# ThoKan Cloud

Private, self-hosted, business cloud platform inspired by Google Drive and iCloud, built for secure enterprise collaboration.

## ✅ Implementation Complete

All 12 steps delivered with production-quality code:

1. ✅ System architecture
2. ✅ Database schema (PostgreSQL with migrations)
3. ✅ Backend API (FastAPI with modular routes)
4. ✅ Authentication system (JWT + refresh tokens + 2FA ready)
5. ✅ File upload system (encrypted storage + versioning)
6. ✅ Permissions system (RBAC + folder/file ACLs)
7. ✅ Frontend dashboard (Next.js + glassmorphism UI)
8. ✅ File manager UI (drag-and-drop + rename/move/delete)
9. ✅ Sharing system (user shares + expiring secure links)
10. ✅ Admin panel (user management + storage insights)
11. ✅ Docker deployment (dev + production compose + nginx reverse proxy)
12. ✅ Production security (CSRF, rate limiting, HTTPS, audit logs, encrypted storage)

## Repository Structure

```
frontend/   # Next.js app (dashboard + file manager UI)
backend/    # FastAPI service (auth, files, sharing, admin)
database/   # PostgreSQL schema, migrations, seeds
docker/     # Dockerfiles, compose overlays, reverse proxy config
scripts/    # automation scripts (bootstrap, backup, restore)
docs/       # architecture and implementation notes
```

## Technology Stack

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + glassmorphism design
- **Backend**: FastAPI + SQLAlchemy + Pydantic + JWT auth + bcrypt
- **Database**: PostgreSQL with relational schema
- **Storage**: Local encrypted storage with optional S3 backend
- **Infrastructure**: Docker Compose (dev/prod profiles), nginx reverse proxy, HTTPS-ready

## Quick Start

### 1. Bootstrap environment

```bash
./scripts/bootstrap.sh
```

This generates random secrets and creates storage directories.

### 2. Start development stack

```bash
docker-compose up --build
```

**Services available:**

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs
- PostgreSQL: localhost:5432

### 3. Default login

After first start, register an account or use seed data once you create an admin user.

## Production Deployment

1. Generate TLS certificates:

```bash
certbot certonly --standalone -d yourdomain.com
```

2. Copy certificates to `docker/ssl/`:

```bash
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem docker/ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem docker/ssl/key.pem
```

3. Update `.env` with strong production secrets

4. Update domain in `docker-compose.prod.yml`

5. Deploy:

```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
```

## Update Channels (Stable/Beta)

The platform supports two update channels with one-click server updates from GitHub-hosted manifests/packages or your own update host, including optional automatic Docker rebuild and Ubuntu package updates.

Default GitHub manifest URLs:

- `https://raw.githubusercontent.com/AlessioD200/ThoKan_cloud/update-channel/stable/latest.json`
- `https://raw.githubusercontent.com/AlessioD200/ThoKan_cloud/update-channel/beta/latest.json`

The repository includes a GitHub Actions workflow that publishes a new update package to the `update-channel` branch on every push to `main`.

- Setup guide: [docs/update-channels.md](docs/update-channels.md)
- Example files: [scripts/update_templates](scripts/update_templates)

## Core Features

### Authentication

- ✅ Email/password registration and login
- ✅ JWT access tokens (15min) + refresh tokens (7 days)
- ✅ Refresh token rotation for enhanced security
- ✅ Password reset via email
- ✅ Optional TOTP 2FA (ready for admin enforcement)
- ✅ Role-based access control (admin, employee)

### File Management

- ✅ Drag-and-drop file upload
- ✅ Create/rename/move/delete folders
- ✅ Rename/move/delete files
- ✅ Download files
- ✅ File versioning (version history tracked)
- ✅ Encrypted blob storage (AES-based)

### Sharing

- ✅ Share files with specific users (granular permissions)
- ✅ Generate secure share links with optional:
  - Password protection
  - Expiration time
  - Download count limits
- ✅ Revoke share links

### Security

- ✅ HTTPS-ready reverse proxy with TLS termination
- ✅ Encrypted file storage at rest
- ✅ Per-folder and per-file ACLs
- ✅ Comprehensive audit logging for all actions
- ✅ Rate limiting (120 req/min default, configurable)
- ✅ CSRF protection for mutating endpoints
- ✅ Secure headers (HSTS, X-Frame-Options, CSP, etc.)
- ✅ File scanning hook pipeline (ready for antivirus integration)

### Dashboard

- ✅ Storage usage overview
- ✅ File count statistics
- ✅ Recent files list
- ✅ Activity logs

### Admin Panel

- ✅ Create and invite users
- ✅ Assign roles (admin/employee)
- ✅ View storage usage per user
- ✅ Manage system settings
- ✅ View full audit log

### UI Design

- ✅ Modern glassmorphism aesthetic
- ✅ Dark and light mode toggle
- ✅ Rounded corners and smooth transitions
- ✅ Responsive layout for desktop/tablet/mobile
- ✅ Inspired by Apple iCloud / Google Drive / Linear.app

## Security Best Practices Implemented

1. **Input validation**: Pydantic schemas validate all API inputs
2. **Password hashing**: bcrypt with configurable rounds
3. **CSRF protection**: Token validation on all mutating routes
4. **Rate limiting**: SlowAPI middleware enforces per-IP limits
5. **Secure headers**: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP
6. **File scanning hooks**: Placeholder for ClamAV or similar integration
7. **Audit logging**: Append-only logs for auth, file access, admin actions
8. **Encryption at rest**: File blobs encrypted with derived keys
9. **Least privilege**: Deny-by-default ACL checks

See [docs/production-security.md](docs/production-security.md) for full hardening checklist.

## Email Integration

Configure SMTP settings in `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=admin@thokan.com
SMTP_PASSWORD=your_password
SMTP_FROM=admin@thokan.com
```

Email is used for:

- Password reset links
- User invitations
- Notification emails (extensible)

## Backup & Restore

Run automated backup:

```bash
./scripts/backup.sh
```

This creates timestamped backups in `./backups/` with:

- Database dump (SQL)
- Storage directory snapshot

## API Documentation

Visit http://localhost:8000/docs for interactive OpenAPI documentation with all endpoints.

### Key Endpoints

**Auth:**

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

**Files:**

- `GET /api/v1/files`
- `POST /api/v1/files/upload`
- `GET /api/v1/files/{file_id}/download`
- `PATCH /api/v1/files/{file_id}/rename`
- `PATCH /api/v1/files/{file_id}/move`
- `DELETE /api/v1/files/{file_id}`
- `GET /api/v1/files/{file_id}/versions`

**Folders:**

- `POST /api/v1/folders`
- `GET /api/v1/folders`
- `DELETE /api/v1/folders/{folder_id}`

**Permissions:**

- `POST /api/v1/permissions/files/{file_id}/users/{user_id}`
- `POST /api/v1/permissions/folders/{folder_id}/users/{user_id}`

**Sharing:**

- `POST /api/v1/sharing/files/{file_id}/users`
- `POST /api/v1/sharing/files/{file_id}/links`
- `POST /api/v1/sharing/links/{token}/download`
- `DELETE /api/v1/sharing/links/{link_id}`

**Dashboard:**

- `GET /api/v1/dashboard`

**Admin:**

- `GET /api/v1/admin/users`
- `POST /api/v1/admin/users`
- `POST /api/v1/admin/users/{user_id}/roles/{role_name}`
- `GET /api/v1/admin/storage-usage`
- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings/{key}`
- `GET /api/v1/admin/audit-logs`

## Folder Structure Highlights

### Backend (`backend/`)

```
app/
├── api/
│   ├── routes/         # REST endpoints by domain
│   │   ├── admin.py
│   │   ├── auth.py
│   │   ├── dashboard.py
│   │   ├── files.py
│   │   ├── folders.py
│   │   ├── permissions.py
│   │   └── sharing.py
│   └── router.py       # API router aggregator
├── core/
│   ├── config.py       # Environment settings
│   ├── csrf.py         # CSRF middleware
│   ├── rate_limit.py   # Rate limiting
│   ├── security.py     # JWT, hashing, token utils
│   └── security_headers.py
├── db/
│   ├── base.py         # SQLAlchemy declarative base
│   └── session.py      # Database session factory
├── models/
│   └── entities.py     # ORM models
├── schemas/
│   └── api.py          # Pydantic request/response models
├── services/
│   ├── audit.py        # Audit logging service
│   ├── email.py        # SMTP email sender
│   ├── encryption.py   # File encryption helpers
│   ├── scanner.py      # File scanner hook
│   └── storage.py      # Storage driver abstraction (local/S3)
├── deps.py             # FastAPI dependencies (auth, roles)
└── main.py             # FastAPI app factory
```

### Frontend (`frontend/`)

```
app/
├── admin/
│   └── page.tsx        # Admin panel
├── dashboard/
│   └── page.tsx        # Dashboard overview
├── files/
│   └── page.tsx        # File manager
├── globals.css         # Tailwind + theme tokens
├── layout.tsx          # Root HTML layout
└── page.tsx            # Login page
components/
├── layout-shell.tsx    # Navigation sidebar + theme toggle
├── theme-toggle.tsx    # Dark/light mode switcher
└── upload-dropzone.tsx # Drag-and-drop file upload
lib/
└── api.ts              # API client utilities
```

## Architecture Highlights

See [docs/step-1-system-architecture.md](docs/step-1-system-architecture.md) for full details.

### Backend Modules

- **auth**: Login, register, refresh, password reset, 2FA
- **users**: Profile management + admin user CRUD
- **files**: File metadata, folders, version history
- **permissions**: RBAC + folder/file ACL rules
- **sharing**: Direct user shares + expiring secure links
- **audit**: Append-only activity log
- **notifications**: Email integration and templates
- **admin**: System settings, user management, storage reports

### Storage Layer

- **Primary**: Local encrypted object storage on disk
- **Pluggable**: Abstract storage driver interface
  - `local` driver (default, in `./storage/`)
  - `s3` driver (optional, S3-compatible)

### Security & Platform Layer

- JWT access + refresh token rotation
- Rate limiting per IP/user
- CSRF protection for cookie flows
- Secure headers (HSTS, X-Frame-Options, CSP baseline)
- Audit event pipeline
- File scanning hook before finalizing uploads

## Development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Contributing

This is a complete production-ready codebase. For custom modifications:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

Proprietary / Business use.

## Support

For questions or custom deployment assistance, contact the development team.

---

**Built with modern best practices for deploying secure, scalable private cloud solutions.**
