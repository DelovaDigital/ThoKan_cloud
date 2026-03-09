#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/test-smtp.sh recipient@company.com"
  exit 1
fi

RECIPIENT="$1"

docker compose exec backend python - <<PY
from app.services.email import send_email

send_email(
    to_email="${RECIPIENT}",
    subject="ThoKan Cloud SMTP test",
    body="If you received this email, SMTP is correctly configured."
)
print("SMTP test email sent (or skipped if SMTP_HOST is empty).")
PY
