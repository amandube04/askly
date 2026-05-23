# Deployment Guide

This guide outlines a judge-friendly deployment setup for Askly.

## Recommended split

- Web (`apps/web`): Vercel
- API (`apps/api`): Railway / Render / Fly.io
- DB: managed PostgreSQL (Neon / Railway Postgres / Supabase Postgres)

## 1) Deploy PostgreSQL

Create a managed PostgreSQL instance and copy:

- `DATABASE_URL`

## 2) Deploy API (`apps/api`)

Set environment variables:

- `DATABASE_URL`
- `BASE_URL` (API public URL, e.g. `https://api.askly.app`)
- `PORT` (platform default often provided)
- `NODE_ENV=prod`
- `APP_BASE_URL` (web URL, e.g. `https://askly.app`)
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` = `https://api.askly.app/auth/google/callback`
- `RESEND_API_KEY` (optional but recommended)
- `RESEND_FROM_EMAIL` (optional but recommended)

Run migrations after DB URL is set:

```bash
pnpm db:migrate
pnpm --filter @repo/database db:seed
```

## 3) Deploy web (`apps/web`)

Set environment variables:

- `NEXT_PUBLIC_API_URL=https://api.askly.app/trpc`

Build command:

```bash
pnpm --filter web build
```

## 4) Google OAuth production config

In Google Cloud OAuth Web client:

- Authorized JS origins:
  - `https://askly.app`
- Authorized redirect URIs:
  - `https://api.askly.app/auth/google/callback`

## 5) Smoke test checklist

- `GET https://api.askly.app/health`
- `GET https://api.askly.app/docs`
- Dashboard login (Google and/or demo login)
- Create form -> publish -> submit -> see responses
- CSV export from responses page
