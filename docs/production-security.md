# ThoKan Cloud — Production Security Checklist

This document covers Step 12 hardening requirements.

## 1. Secrets Management

- [ ] All secrets in `.env` are randomly generated (use `scripts/bootstrap.sh`)
- [ ] JWT secrets are at least 32 bytes of random data
- [ ] Database password is strong and unique
- [ ] Storage encryption key is randomly generated
- [ ] CSRF secret is unique per deployment
- [ ] Secrets are never committed to version control

## 2. HTTPS and TLS

- [ ] Valid TLS certificate installed in `docker/ssl/`
- [ ] HSTS header enabled (see `nginx.conf`)
- [ ] HTTP redirects to HTTPS
- [ ] TLS 1.2+ only (configured)
- [ ] Strong cipher suites configured

## 3. Authentication & Authorization

- [ ] JWT tokens expire (15min access, 7-day refresh)
- [ ] Refresh token rotation enabled
- [ ] Password hashing uses bcrypt
- [ ] Optional 2FA enabled for admin users
- [ ] Failed login attempts are rate-limited

## 4. Input Validation

- [ ] All API inputs validated via Pydantic schemas
- [ ] File upload MIME types verified
- [ ] File size limits enforced (100MB default)
- [ ] SQL injection prevented via SQLAlchemy ORM
- [ ] XSS prevented via React auto-escaping

## 5. CSRF Protection

- [ ] CSRF middleware active on mutating endpoints
- [ ] Token validated for POST/PUT/PATCH/DELETE
- [ ] SameSite cookies configured

## 6. Rate Limiting

- [ ] Rate limiting middleware active (SlowAPI)
- [ ] Default: 120 requests/minute per IP
- [ ] Adjustable via `RATE_LIMIT_PER_MINUTE` env

## 7. Secure Headers

- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Strict-Transport-Security` for HTTPS
- [ ] CSP baseline configured

## 8. File Storage Security

- [ ] Encrypted at rest (AES-based XOR implementation)
- [ ] Storage keys use UUIDs (no predictable paths)
- [ ] File scanner hook implemented (placeholder ready)
- [ ] Quarantine directory for flagged files

## 9. Database Security

- [ ] PostgreSQL runs on internal Docker network
- [ ] No direct external access to DB port in production
- [ ] Prepared statements via SQLAlchemy
- [ ] Minimal user privileges

## 10. Audit Logging

- [ ] All authentication events logged
- [ ] All file access events logged
- [ ] All admin actions logged
- [ ] Logs retained and indexed for analysis

## 11. Permissions & Access Control

- [ ] Deny-by-default ACL model
- [ ] Owner validation on all file mutations
- [ ] Folder inheritance for permissions
- [ ] Admin override capability logged

## 12. Deployment Hardening

- [ ] Docker containers run as non-root users where possible
- [ ] Secrets passed via environment variables
- [ ] No debug mode in production (`APP_ENV=production`)
- [ ] Reverse proxy (nginx) terminates TLS
- [ ] Internal services isolated on private network
- [ ] Health checks configured for container orchestration

## 13. Monitoring & Alerts

- [ ] Health endpoint `/health` available
- [ ] Database connection health monitored
- [ ] Disk usage for storage monitored
- [ ] Failed login rate monitored
- [ ] Audit log anomaly detection (manual review)

## 14. Backup & Recovery

- [ ] Automated backup script (`scripts/backup.sh`)
- [ ] Backups stored off-host or in secure volume
- [ ] Recovery procedure documented
- [ ] Database snapshots retained

## 15. Dependency Security

- [ ] Dependencies pinned to exact versions
- [ ] Regular updates for CVE patches
- [ ] `npm audit` / `pip audit` run periodically

## Optional Enhancements (Future)

- ClamAV or VirusTotal integration for file scanning
- Hardware security module (HSM) for encryption keys
- Web Application Firewall (WAF) in front of nginx
- SIEM integration for centralized logging
- Automated penetration testing
