#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

echo "Creating backup: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

echo "Backing up database..."
docker-compose exec -T postgres pg_dump -U thokan thokan_cloud > "$BACKUP_DIR/database.sql"

echo "Backing up storage..."
cp -r storage "$BACKUP_DIR/storage"

echo "✅ Backup complete: $BACKUP_DIR"
