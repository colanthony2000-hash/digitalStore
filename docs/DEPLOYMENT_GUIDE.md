# Jeneconk Digital Store — Deployment & Operations

Updated 16 November 2026. This guide describes the deployed system; it replaces the earlier Cloud SQL and Cloud Run-only setup instructions.

## Current production topology

- **Public site:** `https://digital.jeneconk.com` on Vercel. Vercel serves the Vite build from `public/` and proxies `/api/*`, `/uploads/*`, `/health`, and `/readyz` to Cloud Run.
- **Application API:** Cloud Run service `digitalstore` in `europe-west3`, at `https://digitalstore-899601549691.europe-west3.run.app`. It uses 1 vCPU, 512 MiB RAM, scale-to-zero, and a maximum of one instance.
- **Database:** Neon PostgreSQL in Frankfurt. The Cloud Run production service uses the `digitalstore_prod` database through `DATABASE_URL` with TLS hostname verification.
- **Object storage:** Neon private Object Storage. Production and staging currently share the same Neon Free project and bucket; keep object keys unique and treat this as a shared-resource boundary.
- **Authentication:** Firebase Authentication. Server-side ID-token checks and role-based admin access remain enabled.
- **Checkout:** Selar is active for the published catalog. Native Paystack is disabled.

The AI Studio Cloud SQL source remains preserved and is not used by the deployed application. The supplied export was restored and verified in a disposable PostgreSQL instance before its catalog data was imported to Neon. No later changes in the source database are included automatically.

## Customer workflows and current limits

- The four catalog products currently have Selar checkout links. A production smoke check returned HTTP 200 for each listing; this does not simulate a paid purchase or Selar fulfillment.
- Customer email/password and Google sign-in use Firebase. The bootstrap admin email documented in the repository is `jeneconklms@gmail.com`; no password is stored in the repository.
- The app supports a branded Firebase action handler at `/account`. In Firebase Console, set the email verification template’s **Action URL** to `https://digital.jeneconk.com/account` so verification links use the in-app success and recovery messages. Until that console setting is made, Firebase’s default `firebaseapp.com` handler remains in use. A stale or already-used one-time link still cannot be reused; the app can only provide a clear recovery path.
- Resend is not configured. Firebase account verification emails remain separate from store notifications.
- Native Paystack remains off. Do not enable it for a product until its protected file, payment credentials, webhook, and payment-to-download flow have been verified.

## Production configuration

The production values are injected into managed services and must not be copied into source files. Important variable names are:

- `DATABASE_URL`: Neon PostgreSQL connection string in Secret Manager. `src/db/index.ts` enforces PostgreSQL protocol and strict TLS verification.
- `OBJECT_STORAGE_BACKEND=neon`, `OBJECT_STORAGE_BUCKET`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`: Neon Object Storage settings. Keep access keys in Secret Manager.
- `DOWNLOAD_SIGNING_SECRET`: random secret of at least 32 bytes, stored in Secret Manager and preserved across revisions.
- `APP_URL=https://digital.jeneconk.com`, `SQL_POOL_MAX=2`, and `PAYSTACK_ALLOW_TEST_MODE=false`.
- `ADMIN_EMAILS`: comma-separated verified Firebase email addresses allowed to bootstrap the initial administrator role.
- Optional email and payment variables: `RESEND_API_KEY`, `SMTP_*`, and `PAYSTACK_*`. They are not required for Selar-only checkout.

`DATABASE_URL` takes precedence over legacy `SQL_*` connection settings. Keep legacy variables blank unless deliberately using a separate disposable development database. Never run `drizzle-kit push`, `seed`, reset, or migration commands against the preserved Cloud SQL source or production without an explicit data-change plan and approval.

## Health and delivery checks

- `/health` is a process liveness check and returns no configuration details.
- `/readyz` checks the PostgreSQL connection and required storage configuration.
- `/robots.txt` and `/sitemap.xml` are proxied to Cloud Run.
- The current smoke checks returned HTTP 200 for the homepage, `/shop`, `/account`, `/admin`, `/health`, `/readyz`, `/robots.txt`, `/sitemap.xml`, and `/api/storefront`. The storefront API returned four products and six categories.
- Build and type-check commands: `npm run lint`, `npm run build`. To validate Vercel output locally, set `VERCEL=1` before `npm run build`; the Vite output directory must remain `public/` to match `vercel.json`.

These checks confirm routes and catalog availability, not end-to-end administrator sign-in, customer verification, a paid Selar order, email delivery, or protected download fulfillment. Verify those workflows separately without using a real payment unless intentionally authorized.

## Cost and recovery controls

- Cloud Run is set to zero minimum and one maximum instance. The Cloud Run spend limit and project budget alerts are set to US$10/month; hitting an enforced cap may take the store offline. Alert and cost data can lag actual usage.
- Neon database and object storage are on the Free plan. The production database and staging database share the Neon project quota, and object storage also shares the bucket. Exhausted free quotas can suspend compute, block writes, or make uploads fail.
- The restored database export is a verified snapshot, not a continuously updated backup. Keep the original source database untouched and make a fresh export before any future migration or destructive schema work.

See [production preparation notes](../deployment/production-preparation.md) for historical architecture, recovery, and staging details. See the [verification report](TESTING_REPORT.md) for the latest checks and remaining unverified workflows.
