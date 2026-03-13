#!/usr/bin/env bash
set -euo pipefail

CHANNEL="${THOKAN_UPDATE_CHANNEL:-stable}"
DRY_RUN="${THOKAN_DRY_RUN:-0}"
TARGET_ROOT="${THOKAN_TARGET_ROOT:-/opt/thokan-cloud}"
PAYLOAD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/payload"

echo "[ThoKan update] channel=${CHANNEL} dry_run=${DRY_RUN}"

echo "[ThoKan update] Expected package structure:"
echo "  update.sh"
echo "  payload/  (files/folders that must be copied into ${TARGET_ROOT})"

if [[ ! -d "${PAYLOAD_DIR}" ]]; then
  echo "[ThoKan update] ERROR: payload directory not found at ${PAYLOAD_DIR}" >&2
  exit 1
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "[ThoKan update] DRY RUN: would sync payload to ${TARGET_ROOT}"
  echo "rsync -a --delete --ignore-errors --exclude storage/ ${PAYLOAD_DIR}/ ${TARGET_ROOT}/"
  exit 0
fi

if [[ ! -d "${TARGET_ROOT}" ]]; then
  echo "[ThoKan update] ERROR: target root does not exist: ${TARGET_ROOT}" >&2
  exit 1
fi

echo "[ThoKan update] Syncing payload to ${TARGET_ROOT}..."
if command -v rsync &>/dev/null; then
  rsync -a --delete --ignore-errors --exclude "storage/" --exclude "docker/ssl/" --exclude ".git/" --exclude ".venv/" --exclude "node_modules/" --exclude ".next/" --exclude "__pycache__/" --exclude "*.pyc" "${PAYLOAD_DIR}/" "${TARGET_ROOT}/" || { rc=$?; [[ $rc -eq 23 || $rc -eq 24 ]] || exit $rc; }
else
  echo "[ThoKan update] rsync not found, falling back to cp"
  cp -a "${PAYLOAD_DIR}/." "${TARGET_ROOT}/"
fi

echo "[ThoKan update] Package payload applied successfully."
echo "[ThoKan update] Docker rebuild + Ubuntu update are handled by server automation settings."
