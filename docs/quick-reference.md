# ThoKan Cloud — Quick Reference

## Start Development Environment

```bash
cd ThoKan_cloud
./scripts/bootstrap.sh  # First time only
docker-compose up --build
```

Visit: http://localhost:3000

## Start Production

```bash
# Setup TLS certificates first (see setup-guide.md)
docker-compose -f docker-compose.prod.yml up -d --build
```

## Backup Data

```bash
./scripts/backup.sh
```

## View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

## Restart Services

```bash
docker-compose restart
```

## Stop Services

```bash
docker-compose down
```

## Reset Everything (DESTRUCTIVE)

```bash
docker-compose down -v  # Deletes database and volumes
```

## Access Database

```bash
docker-compose exec postgres psql -U thokan -d thokan_cloud
```

## Manual Admin Role Assignment

```sql
-- Connect to database first
-- Find user
SELECT id, email FROM users WHERE email = 'youruser@example.com';

-- Get admin role
SELECT id FROM roles WHERE name = 'admin';

-- Assign role
INSERT INTO user_roles (user_id, role_id)
VALUES ('<user_id>', '<admin_role_id>');
```

## Update Application

```bash
git pull
docker-compose down
docker-compose up --build -d
```

## Environment Variables

Copy and customize:

```bash
cp .env.example .env
```

Critical variables:
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `POSTGRES_PASSWORD`
- `STORAGE_ENCRYPTION_KEY`

SMTP (optional):
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`

## Ports

- **3000**: Frontend (Next.js)
- **8000**: Backend API (FastAPI)
- **5432**: PostgreSQL (dev only)
- **80/443**: Nginx (production only)

## Key URLs

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## Common Issues

### "Cannot connect to database"

Check PostgreSQL is running:

```bash
docker-compose ps postgres
docker-compose logs postgres
```

### "JWT token invalid"

Clear browser localStorage and re-login.

### "File upload fails"

- Check `./storage/` directory exists and is writable
- Check backend logs for errors

### "SMTP errors"

- Verify SMTP credentials in `.env`
- Check SMTP host is reachable
- Review backend logs

## File Structure

```
ThoKan_cloud/
├── backend/          # FastAPI application
├── frontend/         # Next.js application
├── database/         # SQL schema and seeds
├── docker/           # Docker configs and nginx
├── scripts/          # Utility scripts
├── docs/             # Documentation
├── storage/          # File uploads (created by bootstrap)
├── .env              # Environment config (generated)
├── docker-compose.yml           # Dev stack
└── docker-compose.prod.yml      # Prod stack
```

## Development Workflow

1. Make code changes in `backend/` or `frontend/`
2. Rebuild: `docker-compose up --build`
3. Test locally
4. Commit and push changes
5. Deploy to production: `docker-compose -f docker-compose.prod.yml up -d --build`

## Security Checklist

Before production deployment:

- [ ] Generate strong secrets via `bootstrap.sh`
- [ ] Setup TLS certificates
- [ ] Configure SMTP for password resets
- [ ] Review `.env` for sensitive data
- [ ] Enable firewall (ports 80, 443 only)
- [ ] Setup automated backups
- [ ] Review [docs/production-security.md](production-security.md)

## Support

For detailed guides:

- [Setup Guide](setup-guide.md)
- [Architecture](step-1-system-architecture.md)
- [Security Checklist](production-security.md)
- [Implementation Summary](implementation-summary.md)
