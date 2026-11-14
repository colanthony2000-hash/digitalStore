# Jeneconk Digital Store — Deployment Guide

## 1. Architecture Overview
- **Frontend**: React 19, Vite 8, Tailwind CSS v4 (`src/`)
- **Backend**: Express 4 TypeScript server (`server.ts`, `src/routes/*`)
- **Database**: PostgreSQL via Cloud SQL and Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`)
- **Authentication**: Firebase Auth (Google Sign-In) with server-side ID token verification (`src/middleware/auth.ts`)
- **Protected Assets**: Stored outside static directories in `storage/protected_products/` and delivered via expiring HMAC-SHA256 signed tokens.

## 2. Environment Variables
Refer to `.env.example`:
- `APP_URL`: Public store URL (`https://digital.jeneconk.com`)
- `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`: Cloud SQL connection configuration.
- `DOWNLOAD_SIGNING_SECRET`: Cryptographically random secret of at least 32 bytes for signing download URLs. Store it in Secret Manager; production downloads stay disabled if it is missing or invalid.
- `ADMIN_EMAILS`: Comma-separated administrator email addresses.
- `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`: Optional until activating Stage 2 native checkout.

## 3. Cloud Run Deployment

Deploy from the repository with the Node.js buildpack. The build creates the Vite frontend in `dist/` and bundles the Express server into `build/server.js`; `npm start` runs that production server.

For the Cloud SQL connection, attach `gen-lang-client-0441456997:europe-west2:ai-studio-30836c46` to the Cloud Run service and set `SQL_HOST` to `/cloudsql/gen-lang-client-0441456997:europe-west2:ai-studio-30836c46`. Configure `SQL_DB_NAME`, `SQL_USER`, and `SQL_PASSWORD` as service environment values, with the password stored in Secret Manager. Set `SQL_POOL_MAX=3` and `APP_URL=https://digital.jeneconk.com`.

Set `DOWNLOAD_SIGNING_SECRET` to a strong secret in Secret Manager before enabling protected downloads. Set `ADMIN_EMAILS` to the store administrator. Do not enable Paystack until production credentials are configured and verified.

Add `digital.jeneconk.com` under Firebase Authentication's authorized domains before using Google sign-in on the custom domain. Grant the Cloud Run service identity the Firebase Authentication Admin permissions needed for administrative user lookups and refresh-token revocation.

Map `digital.jeneconk.com` to the deployed Cloud Run service after deployment. Keep the minimum instance count at zero to allow scale-to-zero.

**Persistent uploads:** the current admin upload paths are local filesystem directories. Cloud Run's local filesystem is ephemeral, so uploaded product files need a persistent Cloud Storage bucket mount before using admin uploads or protected downloads in production.

## 4. Build & Run Commands
```bash
npm install
npm run build
NODE_ENV=production npm start
```

In development:
```bash
npm run dev
```

## 5. Schema Migrations
Update `src/db/schema.ts` and push via Drizzle Kit (`src/db/drizzle.config.ts`) or `cloudsql.UpdateSchema`.
