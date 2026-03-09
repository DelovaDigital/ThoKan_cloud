# Docker

Container definitions for development and production deployment.

## Development

```bash
docker-compose up --build
```

Access:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Postgres: localhost:5432

## Production

1. Generate TLS certificates and place in `docker/ssl/`
2. Update `.env` with production secrets
3. Update `docker-compose.prod.yml` with your domain

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

Nginx reverse proxy handles:
- TLS termination
- HTTP → HTTPS redirect
- Security headers
- Request routing
