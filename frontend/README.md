# Frontend

Next.js application for ThoKan Cloud.

## Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```
## Environment

NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

# Native iOS/Android API URL override
# Production example: https://thokan.cloud/api/v1
# LAN example for physical device testing: http://192.168.1.42:8000/api/v1
NEXT_PUBLIC_NATIVE_API_BASE_URL=https://thokan.cloud/api/v1

# Optional: load the live hosted app inside the native shell
# Production example: https://thokan.cloud
CAPACITOR_SERVER_URL=https://thokan.cloud

App runs on `http://localhost:3000`.

## Android Production Build

Use the hosted domain so the Android app behaves the same as the web app:

```bash
cd frontend
export NEXT_PUBLIC_NATIVE_API_BASE_URL=https://thokan.cloud/api/v1
export CAPACITOR_SERVER_URL=https://thokan.cloud
npm run capacitor:build:android
```
