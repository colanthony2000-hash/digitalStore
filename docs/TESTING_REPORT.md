# Jeneconk Digital Store — Current Verification Report

Updated 16 November 2026. Production is now deployed: Vercel serves `digital.jeneconk.com` and Cloud Run serves the Express API. Live smoke checks returned HTTP 200 for `/`, `/shop`, `/account`, `/admin`, `/health`, `/readyz`, `/robots.txt`, `/sitemap.xml`, and `/api/storefront`; the catalog returned four products and six categories. All four catalog Selar URLs returned HTTP 200. These are availability checks, not completed account, payment, email, or download transactions.

The detailed staging and recovery checks below are historical records from before production launch. Their “not verified” section describes workflows that still need end-to-end verification, not the absence of a production deployment. See the [Deployment Guide](DEPLOYMENT_GUIDE.md) for the current architecture and operational settings.

This report covers repository preparation and the authorized isolated staging checks. It supersedes the older snapshot report, whose table counts and runtime checks have not been rerun against the current application. It is not a production release approval.

## Checks performed

- `npm run lint` (`tsc --noEmit`): **PASS**.
- `npm run build`: **PASS**. Vite reports the existing `__dirname` config warning and a client bundle larger than 500 KB; the server and client build completed.
- `git diff --check`: **PASS**.
- `npm audit --omit=dev`: **PASS**, zero production dependency vulnerabilities. Drizzle Kit and the browser Firebase SDK are build-only dependencies; an npm override pins the affected gRPC package to the patched release. Four moderate findings remain in development-only Drizzle Kit/esbuild dependencies.
- Drizzle config using Neon `DATABASE_URL` with strict TLS: **PASS** against the new staging-only Frankfurt project. The previous Cloud SQL source was not used.
- Staging schema push and catalog-only import: **PASS**. The new Neon database contains 20 application tables, 6 categories, and 4 published Selar-linked products imported from the verified archive. No users, orders, order items, or other customer records were copied into staging.
- Neon Object Storage integration against the private staging bucket: **PASS** for list, upload, HEAD, download, delete, and list-after-delete. Four customer product assets were then uploaded to unique private `protected/` object keys. All four downloads matched their local package SHA-256 and byte length; bucket usage is 16,173,337 bytes across those four objects.
- Staging product-file linkage: **PASS** for the three paid Selar products. The 2027 Life Reset, Christmas Planner, and Lesson Note records now reference their private ZIP bundles and display ZIP metadata. Selar remains the checkout mode and native Paystack eligibility remains false for each. The corrected free mini-guide PDF is stored privately but not linked to its catalog row, preserving its existing Selar free-claim flow.
- Production-mode seed guard: **PASS** by code review; sample catalog rows with Selar links are skipped in production unless explicitly opted into.
- Cloud Build and private Cloud Run staging deployment in `europe-west3`: **PASS**. The image uses Node 24, `npm ci --omit=dev` reported zero vulnerabilities, and the service is limited to 1 vCPU, 1 GiB memory, zero minimum instances, one maximum instance, request-based billing, and no startup CPU boost. Cloud Run IAM authentication remains required.
- Authenticated staging smoke checks through the local Cloud Run proxy: `/health` **200**, `/readyz` **200 ready**, `/api/storefront` **200** with 6 categories, 4 published products, and 4 Selar links; native checkout remains disabled. Cloud Run's frontend returns a Google 404 for `/healthz`, so `/health` is the liveness URL used for Cloud Run.
- Paystack signature smoke checks using synthetic test credentials: **PASS** for current timestamped `Paystack-Signature`, legacy `x-paystack-signature`, modified-body rejection, stale-timestamp rejection, malformed-signature rejection, production test-key blocking, explicit staging override, and live-key activation.
- Object-storage missing-file check with mocked HTTP response: **PASS**; a `HEAD 404` is treated as a missing object rather than an unhandled storage error.
- Object-storage quota checks with mocked S3 listing and the disposable PostgreSQL advisory lock: **PASS** for multi-page listing, continuation-token decoding, uploads at the configured boundary, and rejecting an upload above the cap.
- Database backup archive: manifest SHA-256 matches the supplied SQL file. It restored successfully to a disposable PostgreSQL 18.6 cluster with `ON_ERROR_STOP=1`. Actual counts match the archive inventory: 20 tables, 32 records, expected column counts, 20 sequences, 20 primary keys, 14 foreign keys, 12 unique constraints, and no extra indexes. Current Drizzle table names match, and full-column `SELECT * ... LIMIT 1` queries passed for all 20 app tables. Read-only queries returned 4 published Selar-linked products, 6 categories, 7 settings, and zero users/orders/order items. The source Cloud SQL database was not contacted or modified.

## Not verified

- The restore verified the supplied export, not changes made to the source after the export was created. No production database migration has been run.
- No live Cloud SQL, Firebase, Resend, Selar, or Paystack workflow was exercised. Neon PostgreSQL and Object Storage were contacted only in the isolated Free staging project.
- No end-to-end customer, administrator, authentication, checkout, webhook, or app-authorized file-download workflow was run. The four private object downloads themselves were checksum-verified directly against Neon Object Storage.
- The Paystack code is not activated with live credentials. Protected files are staged for the three paid catalog products, but native checkout remains disabled and payment-to-download has not been tested. Selar delivery remains independent.
- No DNS change, production migration, production environment update, or customer data copy was performed. The Cloud Run service is staging-only and requires IAM authentication. Only the category and product catalog records from the supplied export were copied to staging.
- Firebase browser sign-in, Firebase Admin management operations, live Selar checkout, Paystack webhooks, and customer download delivery remain unverified. The staging database contains only the imported categories and Selar-linked catalog products; Firebase Auth domain settings and broad Firebase Admin permissions were not changed on the shared project.

Selar checkout can launch without app copies of the product masters. Staging now has the four exported Selar-linked products, six categories, and private protected file copies. The free mini-guide copy is not linked in its product row, so the Selar claim flow remains unchanged. Production readiness still requires an approved production data plan, Firebase sign-in and administrator workflow verification, and staging verification of checkout, customer support, and app-authorized downloads. Native Paystack remains disabled until a separate payment-to-download test passes.
