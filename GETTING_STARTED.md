# Getting Started with ThoKan Cloud

ThoKan Cloud is ready to run in 3 simple steps.

## Prerequisites

- Docker and Docker Compose installed
- Git installed

## Quick Start

### 1. Clone and bootstrap

```bash
git clone <repository-url>
cd ThoKan_cloud
./scripts/bootstrap.sh
```

This creates `.env` with random secrets and sets up storage directories.

### 2. Start services

```bash
docker-compose up --build
```

Wait for all services to start (takes ~30 seconds first time).

### 3. Access the application

Open your browser:

**http://localhost:3000**

## First Use

1. Click register and create your account
2. Login with your credentials
3. Upload files via drag-and-drop
4. Create folders to organize files
5. Share files with other users or generate secure links

## Make Yourself Admin

To access the admin panel, promote your user to admin:

```bash
# Connect to database
docker-compose exec postgres psql -U thokan -d thokan_cloud

# Find your user ID
SELECT id, email FROM users WHERE email = 'your@email.com';

# Get admin role ID
SELECT id FROM roles WHERE name = 'admin';

# Assign admin role (replace <user_id> and <role_id>)
INSERT INTO user_roles (user_id, role_id) 
VALUES ('<user_id>', '<role_id>');

# Exit database
\q
```

Refresh your browser and access `/admin`.

## What You Get

- ✅ Secure file storage with encryption
- ✅ User authentication with JWT
- ✅ Drag-and-drop file uploads
- ✅ File versioning
- ✅ Folder organization
- ✅ Share files with users or public links
- ✅ Admin panel for user management
- ✅ Dark/light mode UI
- ✅ Full audit logging

## Next Steps

### Development

- Edit code in `backend/` or `frontend/`
- Restart containers: `docker-compose restart`
- View logs: `docker-compose logs -f`

### Production Deployment

See [docs/setup-guide.md](docs/setup-guide.md) for full production deployment with HTTPS.

### Backup Your Data

```bash
./scripts/backup.sh
```

## Explore the Platform

### Frontend URLs

- Login: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- Files: http://localhost:3000/files
- Admin: http://localhost:3000/admin

### Backend URLs

- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

## Stop Services

```bash
docker-compose down
```

## Need Help?

- Full setup guide: [docs/setup-guide.md](docs/setup-guide.md)
- Quick reference: [docs/quick-reference.md](docs/quick-reference.md)
- Architecture: [docs/step-1-system-architecture.md](docs/step-1-system-architecture.md)
- Security: [docs/production-security.md](docs/production-security.md)

---

**That's it! You now have a private business cloud running locally.**
