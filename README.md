# Jeneconk Digital Store

Official digital products marketplace for **Jeneconk Integrated Global Solutions Limited** (`https://digital.jeneconk.com`), paired with parent corporate site `https://www.jeneconk.com` and companion platforms (`koboledger.jeneconk.com`, `edu.jeneconk.com`, `studycoach.jeneconk.com`, `leadgen.jeneconk.com`).

## Architecture Summary
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4 (`src/`)
- **Backend**: Express 4 TypeScript server (`server.ts`, `src/routes/*`)
- **Database**: PostgreSQL (Cloud SQL) with Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`, `src/db/seed.ts`)
- **Authentication**: Firebase Authentication (Google Sign-In) with server-side ID token verification via `firebase-admin` (`src/middleware/auth.ts`)
- **Payments & Fulfilment**:
  - **Stage 1 (Active Default)**: External marketplace checkout via verified Selar URLs configured in the Admin Dashboard (`marketplaceUrl`), plus UTM outbound click tracking.
  - **Stage 2 (Disabled Until Activated)**: Native Paystack checkout and HMAC-SHA512 webhook verification remain disabled until genuine Paystack credentials and the Admin toggle are enabled (`src/lib/integrations.ts`).
- **Analytics & Marketing**: Optional Pinterest Tag (`PINTEREST_TAG_ID`) and Google Analytics (`GA_MEASUREMENT_ID`) remain disabled whenever unset or set to development placeholders.

## Quick Start (Local / Codex Review)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables based on `.env.example` (Cloud SQL `SQL_*`, `APP_URL`, `DOWNLOAD_SIGNING_SECRET`, `ADMIN_EMAILS`, and optional Paystack/Pinterest credentials).
3. Push the PostgreSQL schema via Drizzle Kit:
   ```bash
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   ```
4. Run TypeScript typechecking and production build:
   ```bash
   npm run lint
   npm run build
   ```
5. Start the development server (`http://localhost:3000`):
   ```bash
   npm run dev
   ```

## Documentation
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Admin & Product Upload Guide](docs/ADMIN_AND_UPLOAD_GUIDE.md)
- [Payment Integration Architecture](docs/PAYMENT_INTEGRATION.md)
- [Security & SEO Checklist](docs/SECURITY_AND_SEO_CHECKLIST.md)
- [Testing & Verification Report](docs/TESTING_REPORT.md)
