#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="${THOKAN_DRY_RUN:-0}"

echo "Starting ThoKan custom update"
echo "Dry run: ${DRY_RUN}"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "Dry run enabled, no destructive actions will be executed."
  exit 0
fi

# Put your custom firmware/app update logic below.
# Example:
# cp -r ./my-assets/* /app/storage/
# python /app/scripts/migrate_custom_data.py

echo "Custom update finished"
