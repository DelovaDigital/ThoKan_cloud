#!/usr/bin/env bash
set -euo pipefail

echo "ThoKan Cloud Bootstrap Script"
echo "=============================="

if [[ ! -f .env ]]; then
  echo "Generating .env from .env.example..."
  cp .env.example .env
  
  ACCESS_SECRET=$(openssl rand -base64 48)
  REFRESH_SECRET=$(openssl rand -base64 48)
  CSRF_SECRET=$(openssl rand -base64 32)
  DB_PASSWORD=$(openssl rand -base64 24)
  ENCRYPTION_KEY=$(openssl rand -base64 32)
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|change_me_access_secret|$ACCESS_SECRET|g" .env
    sed -i '' "s|change_me_refresh_secret|$REFRESH_SECRET|g" .env
    sed -i '' "s|change_me_csrf_secret|$CSRF_SECRET|g" .env
    sed -i '' "s|change_me_db_password|$DB_PASSWORD|g" .env
    sed -i '' "s|change_me_32_plus_chars|$ENCRYPTION_KEY|g" .env
  else
    sed -i "s|change_me_access_secret|$ACCESS_SECRET|g" .env
    sed -i "s|change_me_refresh_secret|$REFRESH_SECRET|g" .env
    sed -i "s|change_me_csrf_secret|$CSRF_SECRET|g" .env
    sed -i "s|change_me_db_password|$DB_PASSWORD|g" .env
    sed -i "s|change_me_32_plus_chars|$ENCRYPTION_KEY|g" .env
  fi
  
  echo "✅ .env created with random secrets"
else
  echo "⚠️  .env already exists, skipping"
fi

echo ""
echo "Creating storage directories..."
mkdir -p storage/uploads storage/tmp storage/quarantine storage/encrypted

echo ""
echo "✅ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "  1. Review and customize .env if needed"
echo "  2. Run: docker compose up --build"
echo "  3. Access frontend at http://localhost:3000"
echo "  4. Access backend API docs at http://localhost:8000/docs"
