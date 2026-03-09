# ThoKan Cloud — Setup Guide

## Prerequisites

- Docker and Docker Compose installed
- (For production) Domain with DNS configured
- (For production) Valid TLS certificates

## Development Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd ThoKan_cloud
```

### 2. Bootstrap environment

```bash
./scripts/bootstrap.sh
```

This script:

- Copies `.env.example` to `.env`
- Generates random secrets for JWT, CSRF, database, encryption
- Creates storage directories

### 3. Start development stack

```bash
docker compose up --build
```

This starts:

- PostgreSQL (with schema and seed data auto-applied)
- FastAPI backend on port 8000
- Next.js frontend on port 3000

### 4. Access the application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### 5. Create your first user (no PostgreSQL needed)

The easiest way is to call the register endpoint:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
	-H "Content-Type: application/json" \
	-d '{
		"email": "thomas@thokan.be",
		"full_name": "Depreytere Thomas",
		"password": "1034077111"
	}'
```

Then login at http://localhost:3000 with that email/password.

### 6. Promote a user to admin (PostgreSQL)

If you need admin access, promote your user manually:

```bash
docker compose exec postgres psql -U thokan -d thokan_cloud

-- Find your user ID
SELECT id, email FROM users;

-- Get admin role ID
SELECT id, name FROM roles WHERE name = 'admin';

-- Assign admin role
INSERT INTO user_roles (user_id, role_id) VALUES ('<your-user-id>', '<admin-role-id>');
```

Or use the backend API after login to call `/api/v1/admin/users/{user_id}/roles/admin` (requires existing admin).

## Production Setup

### 0. Fast Ubuntu server bootstrap (recommended)

On Ubuntu 22.04/24.04, run:

```bash
sudo PROJECT_DIR=/opt/thokan-cloud STORAGE_PATH=/mnt/thokan-storage bash scripts/ubuntu-server-setup.sh
```

This installs Docker Engine + Compose plugin and prepares your storage mount path.

If you want to choose a specific disk device for file storage:

```bash
sudo PROJECT_DIR=/opt/thokan-cloud STORAGE_PATH=/mnt/thokan-storage DISK_DEVICE=/dev/sdb1 bash scripts/ubuntu-server-setup.sh
```

If that device has no filesystem yet, use `AUTO_FORMAT=true` to format it as ext4.

### 1. Generate TLS certificates

Using Let's Encrypt:

```bash
certbot certonly --standalone -d yourdomain.com
```

### 2. Copy certificates

```bash
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem docker/ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem docker/ssl/key.pem
```

### 3. Configure environment

Edit `.env`:

- Set `APP_ENV=production`
- Set strong unique secrets (already done by bootstrap script)
- Configure SMTP for email notifications (`SMTP_*`)
- Set storage disk path with `STORAGE_HOST_PATH=/mnt/thokan-storage`
- Configure mailbox in the in-app **Mail** page after login
- Set `APP_URL` and `API_URL` to your domain

### 4. Update compose file

Edit `docker-compose.prod.yml`:

- Replace `yourdomain.com` with your actual domain in frontend environment

### 5. Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 6. Setup firewall

Allow only ports 80 and 443:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 7. Setup automated backups

Add to crontab:

```bash
crontab -e
```

Add:

```
0 2 * * * /path/to/ThoKan_cloud/scripts/backup.sh >> /var/log/thokan-backup.log 2>&1
```

This runs daily backups at 2 AM.

### 8. Configure dedicated file disk (recommended)

If you attached an extra disk (example `/dev/sdb`):

```bash
sudo mkfs.ext4 /dev/sdb
sudo mkdir -p /mnt/thokan-storage
sudo mount /dev/sdb /mnt/thokan-storage
echo '/dev/sdb /mnt/thokan-storage ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo chown -R $USER:$USER /mnt/thokan-storage
```

Then set in `.env`:

```dotenv
STORAGE_HOST_PATH=/mnt/thokan-storage
```

Restart services:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 9. Configure business email (integrated Mail in app)

In `.env`, set:

```dotenv
SMTP_HOST=smtp.yourcompany.com
SMTP_PORT=587
SMTP_USER=no-reply@yourcompany.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=no-reply@yourcompany.com
SMTP_USE_TLS=true
SMTP_USE_SSL=false
```

Test sending:

```bash
./scripts/test-smtp.sh your-personal-email@example.com
```

Then in ThoKan Cloud open **Mail** in the left menu:

- Save your mailbox settings (IMAP + SMTP)
- Test connection
- Read inbox messages inside ThoKan Cloud
- Send mails from inside ThoKan Cloud

### 10. Cloud-system widget

- Dashboard shows cloud host/storage information (hostname, platform, cpu cores, disk usage)

## Environment Variables Reference

See [.env.example](.env.example) for all available options.

### Critical Variables

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: Must be random, unique
- `CSRF_SECRET`: Random secret for CSRF tokens
- `POSTGRES_PASSWORD`: Strong database password
- `STORAGE_ENCRYPTION_KEY`: 32+ character random key for file encryption

### Optional Variables

- `SMTP_*`: Email server configuration for password reset / invitations
- `S3_*`: AWS S3 or compatible storage (if not using local storage)
- `RATE_LIMIT_PER_MINUTE`: API rate limit (default 120)

## Troubleshooting

### Database connection errors

Ensure PostgreSQL is healthy:

```bash
docker compose ps
docker compose logs postgres
```

### Backend API not responding

Check backend logs:

```bash
docker compose logs backend
```

### Frontend can't reach backend

Verify `NEXT_PUBLIC_API_BASE_URL` in frontend `.env.local` or Docker environment.

### File upload fails

- Check storage directory permissions
- Verify `STORAGE_LOCAL_ROOT` path exists and is writable
- Check backend logs for encryption/storage errors

### Email not sending

- Verify SMTP credentials in `.env`
- Test with `./scripts/test-smtp.sh your-email@example.com`
- Check backend logs for email service errors

## Maintenance

### View logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Run database backup

```bash
./scripts/backup.sh
```

### Update application

```bash
git pull
docker compose down
docker compose up --build -d
```

### Reset database (CAUTION: deletes all data)

```bash
docker compose down -v
docker compose up --build
```

## Next Steps

- Configure SMTP for email notifications
- Enable 2FA for admin users
- Integrate antivirus scanner (update `app/services/scanner.py`)
- Setup monitoring and alerting
- Review [docs/production-security.md](docs/production-security.md) checklist
