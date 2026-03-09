#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/ubuntu-server-setup.sh"
  exit 1
fi

PROJECT_DIR="${PROJECT_DIR:-/opt/thokan-cloud}"
STORAGE_PATH="${STORAGE_PATH:-/mnt/thokan-storage}"
DISK_DEVICE="${DISK_DEVICE:-}"
AUTO_FORMAT="${AUTO_FORMAT:-false}"

echo "ThoKan Cloud Ubuntu Server Setup"
echo "==============================="
echo "Project dir : ${PROJECT_DIR}"
echo "Storage path: ${STORAGE_PATH}"
echo "Disk device : ${DISK_DEVICE:-<not set>}"

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release git

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker

if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "${SUDO_USER}" || true
fi

mkdir -p "${PROJECT_DIR}" "${STORAGE_PATH}"
chmod 750 "${STORAGE_PATH}"

if [[ -n "${DISK_DEVICE}" ]]; then
  if [[ ! -b "${DISK_DEVICE}" ]]; then
    echo "Disk device ${DISK_DEVICE} not found. Use lsblk to inspect available devices."
    exit 1
  fi

  if ! blkid "${DISK_DEVICE}" >/dev/null 2>&1; then
    if [[ "${AUTO_FORMAT}" == "true" ]]; then
      mkfs.ext4 "${DISK_DEVICE}"
    else
      echo "${DISK_DEVICE} has no filesystem. Re-run with AUTO_FORMAT=true to format as ext4."
      exit 1
    fi
  fi

  mount "${DISK_DEVICE}" "${STORAGE_PATH}"
  if ! grep -q "${DISK_DEVICE} ${STORAGE_PATH}" /etc/fstab; then
    echo "${DISK_DEVICE} ${STORAGE_PATH} ext4 defaults,nofail 0 2" >> /etc/fstab
  fi
  chown -R "${SUDO_USER:-root}:${SUDO_USER:-root}" "${STORAGE_PATH}"
fi

echo ""
echo "✅ Docker installed and storage path prepared"
echo ""
echo "Next steps:"
echo "  1) Clone project into ${PROJECT_DIR}"
echo "  2) cd ${PROJECT_DIR} && ./scripts/bootstrap.sh"
echo "  3) In .env set: APP_ENV=production"
echo "  4) In .env set: STORAGE_HOST_PATH=${STORAGE_PATH}"
echo "  5) Configure SMTP_* values in .env"
echo "  6) Start: docker compose -f docker-compose.prod.yml up -d --build"
