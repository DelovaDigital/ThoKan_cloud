# Ubuntu Server Deployment Guide

## Quick Start (zonder Nginx reverse proxy)

### 1. Installeer Docker op Ubuntu

```bash
# Update systeem
sudo apt update && sudo apt upgrade -y

# Installeer Docker
curl -fsSL https://get.docker.com | sh

# Voeg je gebruiker toe aan docker groep
sudo usermod -aG docker $USER
newgrp docker

# Test Docker
docker --version
docker compose version
```

### 2. Clone project op server

```bash
# Via Git
git clone https://github.com/jouw-username/ThoKan_cloud.git
cd ThoKan_cloud

# Of upload bestanden via SCP/SFTP naar /opt/thokan-cloud
```

### 3. Configureer environment voor je server IP

**Belangrijk:** Vervang `YOUR_SERVER_IP` met het echte IP van je Ubuntu server (bijv. `192.168.1.100` of `45.67.89.123`).

```bash
# Kopieer .env.example naar .env
cp .env.example .env

# Edit .env met je favoriete editor
nano .env
```

**Wijzig deze regels in `.env`:**

```dotenv
# Voor externe toegang via server IP:
CORS_ORIGINS=http://YOUR_SERVER_IP:3000,http://localhost:3000,capacitor://localhost,ionic://localhost
NEXT_PUBLIC_API_BASE_URL=http://YOUR_SERVER_IP:8000/api/v1

# Verander alle secrets! (VERPLICHT voor productie)
JWT_ACCESS_SECRET=xxxxxxxxxxxxxxxxxxxxx  # Genereer met: openssl rand -hex 32
JWT_REFRESH_SECRET=xxxxxxxxxxxxxxxxxxxxx  # Genereer met: openssl rand -hex 32
CSRF_SECRET=xxxxxxxxxxxxxxxxxxxxx        # Genereer met: openssl rand -hex 32
POSTGRES_PASSWORD=xxxxxxxxxxxxxxxxxxxxx
STORAGE_ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Min 32 chars
```

**Voorbeeld voor server IP `192.168.1.50`:**

```dotenv
CORS_ORIGINS=http://192.168.1.50:3000,http://localhost:3000,capacitor://localhost
NEXT_PUBLIC_API_BASE_URL=http://192.168.1.50:8000/api/v1
```

### 4. Open firewall poorten

```bash
# Installeer UFW als niet aanwezig
sudo apt install -y ufw

# Open poorten voor frontend en backend
sudo ufw allow 3000/tcp comment 'ThoKan Frontend'
sudo ufw allow 8000/tcp comment 'ThoKan Backend API'
sudo ufw allow 22/tcp comment 'SSH'

# Activeer firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### 5. Start applicatie

```bash
# Build en start alle containers
docker compose up -d --build

# Check status
docker compose ps

# Bekijk logs
docker compose logs -f
```

Je applicatie is nu beschikbaar op:
- **Frontend:** `http://YOUR_SERVER_IP:3000`
- **Backend API:** `http://YOUR_SERVER_IP:8000/api/v1`
- **Health check:** `http://YOUR_SERVER_IP:8000/health`

### 6. Maak eerste gebruiker en admin

```bash
# Registreer gebruiker
curl -X POST http://YOUR_SERVER_IP:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jouw@email.be",
    "full_name": "Jouw Naam",
    "password": "veilig_wachtwoord"
  }'

# Maak admin (verander email naar jouw email)
docker compose exec postgres psql -U thokan -d thokan_cloud -c "
INSERT INTO user_roles (user_id, role_id) 
SELECT u.id, r.id 
FROM users u, roles r 
WHERE u.email = 'jouw@email.be' AND r.name = 'admin'
ON CONFLICT DO NOTHING;
"

# Check of het gelukt is
docker compose exec postgres psql -U thokan -d thokan_cloud -c "
SELECT u.email, r.name as role 
FROM users u 
JOIN user_roles ur ON u.id = ur.user_id 
JOIN roles r ON ur.role_id = r.id 
WHERE u.email = 'jouw@email.be';
"
```

## Troubleshooting

### "Cannot reach API server" error

**Check 1: Zijn containers actief?**
```bash
docker compose ps
# Alle 3 containers (postgres, backend, frontend) moeten "Up" zijn
```

**Check 2: Is backend gezond?**
```bash
curl http://localhost:8000/health
# Moet returnen: {"status":"ok","service":"thokan-cloud-api"}
```

**Check 3: Zijn poorten open?**
```bash
# Van binnen de server
curl http://localhost:8000/health
curl http://localhost:3000

# Van buiten de server (van je laptop)
curl http://YOUR_SERVER_IP:8000/health
curl http://YOUR_SERVER_IP:3000
```

**Check 4: CORS configuratie**
```bash
docker compose logs backend | grep -i cors
```

**Check 5: Frontend API URL**
```bash
docker compose exec frontend env | grep NEXT_PUBLIC_API_BASE_URL
# Moet jouw server IP bevatten, niet "localhost"
```

### Backend logs bekijken

```bash
docker compose logs -f backend
```

### Database verbinding fout

```bash
docker compose logs postgres
docker compose restart backend
```

### Herstart alles

```bash
docker compose down
docker compose up -d --build
```

## Met domeinnaam (optioneel)

Als je een domeinnaam hebt (bijv. `thokan.cloud`):

### 1. Configureer DNS

Maak een A-record:
```
thokan.cloud → YOUR_SERVER_IP
```

### 2. Update .env

```dotenv
CORS_ORIGINS=https://thokan.cloud,http://thokan.cloud,http://localhost:3000
NEXT_PUBLIC_API_BASE_URL=https://thokan.cloud/api/v1
```

### 3. Gebruik Nginx met SSL

Zie `docker-compose.prod.yml` en volg [docs/setup-guide.md](docs/setup-guide.md) Production Setup stappen.

## Maintenance

### Logs bekijken

```bash
docker compose logs -f            # Alle logs
docker compose logs -f backend    # Alleen backend
docker compose logs -f frontend   # Alleen frontend
```

### Applicatie updaten

```bash
git pull                           # Haal nieuwe code op
docker compose down                # Stop containers
sudo docker compose -f docker-compose.prod.yml up -d --build
```

De ingebouwde updatefunctie in Cloud draait na een succesvolle update exact hetzelfde productiecommando.

### Backup database

```bash
docker compose exec postgres pg_dump -U thokan thokan_cloud > backup-$(date +%Y%m%d).sql
```

### Restore database

```bash
docker compose exec -T postgres psql -U thokan thokan_cloud < backup-20260309.sql
```

## Security Checklist

- [ ] Sterke wachtwoorden in `.env` voor alle secrets
- [ ] UFW firewall actief
- [ ] SSH key-based login (disable password login)
- [ ] Alleen poort 22, 80, 443 open (en tijdelijk 3000/8000 voor dev)
- [ ] SSL certificaat (Let's Encrypt) voor productie
- [ ] Regular backups (cron job)
- [ ] Updates: `sudo apt update && sudo apt upgrade`
