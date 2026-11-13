# Jeneconk Digital Store — Deployment Guide

## 1. Architecture Overview
- **Frontend**: React 19, Vite 8, Tailwind CSS v4 (`src/`)
- **Backend**: Express 4 TypeScript server (`server.ts`, `src/routes/*`)
- **Database**: PostgreSQL via Cloud SQL & Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`)
- **Authentication**: Firebase Auth (Google Sign-In) with server-side ID token verification (`src/middleware/auth.ts`)
- **Protected Assets**: Stored outside static directories in `storage/protected_products/` and delivered via expiring HMAC-SHA256 signed tokens.

## 2. Environment Variables
Refer to `.env.example`:
- `APP_URL`: Public store URL (e.g., `https://digital.jeneconk.com`)
- `PORT`: Listening port (`3000`)
- `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`: Provided by the Cloud SQL runtime.
- `DOWNLOAD_SIGNING_SECRET`: Strong random secret for signing download URLs.
- `ADMIN_EMAILS`: Comma-separated list of administrator email addresses (defaults to `jeneconklms@gmail.com`).
- `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`: Optional until activating Stage 2 native checkout.

## 3. Build & Run Commands
```bash
npm install
npm run build
NODE_ENV=production npm start
```
In development:
```bash
npm run dev
```

## 4. Schema Migrations
Update `src/db/schema.ts` and push via Drizzle Kit (`src/db/drizzle.config.ts`) or `cloudsql.UpdateSchema`.
