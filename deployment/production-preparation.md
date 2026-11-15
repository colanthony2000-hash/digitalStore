# Digital Store production preparation

This document records the production deployment preparation and the separately authorized isolated staging setup. Staging Cloud Run, Neon, Artifact Registry, and Secret Manager resources now exist. No production service, DNS, production environment, email delivery, or Cloud SQL source was changed. The supplied Cloud SQL export was restored and checked in a disposable PostgreSQL instance; the source remains untouched.

## Prepared application behavior

- Cloud Run starts the existing Express application on the injected `PORT` (8080 in the example manifest).
- `/healthz` is a non-sensitive process health endpoint. `/readyz` checks PostgreSQL and required storage configuration without changing data.
- SIGTERM/SIGINT close the HTTP server, Vite development server when present, and PostgreSQL pool within Cloud Run's shutdown window.
- `DATABASE_URL` takes precedence over the legacy `SQL_*` variables. Neon URLs are normalized to TLS with hostname/certificate verification. The legacy variables remain for local/older environments; the example values are blank so they cannot silently select the old AI Studio database.
- Demo seeding is disabled automatically in production unless `ENABLE_DEMO_SEED=true` is explicitly set. The seed catalog includes sample Selar links and must not populate an empty production or staging database.
- The process-only liveness endpoint is `/health`; `/readyz` checks database connectivity and object-storage configuration. Keep Cloud Run request-based billing and scale-to-zero; HTTP health probes require instance-based billing, so Cloud Run's default TCP startup check is used.
- Production refuses local-disk object storage and refuses to start without a download-signing secret, Neon storage configuration, and the built frontend.
- Public catalog assets keep stable `/uploads/<filename>` paths. In production, those paths redirect to short-lived signed object URLs. Protected files remain private and are streamed through the app only after the existing customer/order/download-token checks. This preserves download-count enforcement and does not expose a reusable object URL.
- Local development retains a disk-backed storage fallback. It is explicitly rejected when `NODE_ENV=production`.
- Firebase Authentication remains the identity system. The Admin SDK uses Application Default Credentials, which resolves to the Cloud Run runtime service identity; no service-account JSON/private key is added to the repo or container.
- Resend is selected ahead of legacy SMTP when `RESEND_API_KEY` is present. No email is sent unless a real key is configured. When it is absent, the existing “not configured” email-log behavior remains.
- Selar product links and checkout remain available. The native Paystack path now supports current signed and legacy webhook formats, and refuses checkout when a selected product's protected delivery file is missing.

## Files and settings

- `Dockerfile` builds the UI and server in a multi-stage Node 24 image, omits development dependencies from the runtime image, and runs as the unprivileged `node` user.
- `.dockerignore` keeps local secrets, git metadata, dependency/build output, and the local `storage/` directory out of the image.
- `deployment/cloud-run-service.yaml.example` is a template only. Replace all `REPLACE_WITH_*` values and create the named secret versions before using it.
- `.env.example` documents variable names only. Do not put actual credentials in it.

### Recommended first deployment settings

- Cloud Run region: `europe-west3` (Frankfurt), alongside the Neon Frankfurt project.
- Billing: request-based; minimum instances 0; maximum instances 3; concurrency 4; timeout 300 seconds.
- Resources: 1 vCPU and 1 GiB RAM per instance.
- Database pool: 2 connections per instance. At three instances, the app pool is capped at six connections.
- Container port: 8080. `PORT` is also accepted from Cloud Run.
- Health endpoints: `/healthz` for liveness checks and `/readyz` for a readiness check by an external monitor or load balancer. The template deliberately omits Cloud Run custom probes: Google documents that configured health-check probes require instance-based billing. If native probes are required, choose instance-based billing and recalculate cost before deployment.
- Use a dedicated runtime service identity. Grant it `roles/secretmanager.secretAccessor` only on the four base secrets below, plus the optional Paystack/Resend secrets only if those integrations are enabled, and the minimum Firebase Authentication permissions required for current admin user-management operations. No user-managed service-account key is needed.

### Secret Manager entries

Create these only after the required approval. Never paste their values into this repository. The two Paystack secrets are conditional and are not required for a Selar-only launch.

| Secret name | Value source |
|---|---|
| `digitalstore-database-url` | Neon PostgreSQL connection string for the approved Frankfurt branch, with TLS enabled |
| `digitalstore-object-storage-access-key` | Neon Object Storage access key for the approved branch/bucket |
| `digitalstore-object-storage-secret-key` | Matching Neon Object Storage secret key |
| `digitalstore-download-signing-secret` | Random secret of at least 32 bytes; preserve its value across revisions so existing tokens are handled consistently |
| `digitalstore-paystack-secret-key` | Conditional: Paystack server secret key; use the test key for staging and the live key only after test transactions pass |
| `digitalstore-paystack-webhook-secret` | Conditional: Paystack dashboard webhook signing secret (`whsec_...`) for current timestamped `Paystack-Signature` verification |
| `digitalstore-resend-api-key` | Resend transactional API key; optional until email setup is approved (add the Cloud Run secret reference when ready) |

Non-secret runtime settings required by the example: `OBJECT_STORAGE_BACKEND=neon`, bucket name, `OBJECT_STORAGE_MAX_BYTES=4000000000`, Neon S3 endpoint, signing region, `APP_URL=https://digital.jeneconk.com`, `SQL_POOL_MAX=2`, and `PAYSTACK_ALLOW_TEST_MODE=false`. Paystack keys are optional for Selar-only launch. A production service refuses to activate checkout with Paystack test keys unless this is explicitly overridden; only isolated staging may set it to `true`. Firebase Admin uses the configured Firebase project ID and Cloud Run Application Default Credentials.

The deploying identity will need Cloud Run Developer (`roles/run.developer`) and Service Account User (`roles/iam.serviceAccountUser`) on the selected runtime identity. The image publishing identity needs Artifact Registry Writer (`roles/artifactregistry.writer`); the Cloud Build execution identity needs the project roles required to build and publish that image. Scope these grants to the project/repository and service identity rather than granting Owner.

## Object storage model and asset preservation

Neon Object Storage is S3-compatible and supports private buckets and signed URLs. The app uses one **private** bucket with `public/` and `protected/` key prefixes. Admin uploads are held in memory only for the request, then written to the object store; the production container's filesystem is never used as persistent storage.

Existing product rows can store protected filenames rather than full paths. If the app itself serves a product download, the adapter maps that filename to `protected/<filename>` and any file migration must preserve its basename. Existing `/uploads/<filename>` values map to `public/<filename>`. Do not upload over a production bucket until an asset inventory and duplicate-key check are complete. For products fulfilled through the existing Selar checkout, Selar remains responsible for payment and file delivery; those product masters do not need to be copied into this app for that flow.

The checked-out repository contains six tracked catalog/hero images under `public/assets/images/`; the Vite build copies all six into `dist/assets/images/`, and the Docker image includes `dist/`. The ignored `storage/` directories contain only `.gitkeep` placeholders. The newly supplied archive contains 17 images, including project artwork and temporary media, but no `storage/` upload paths or downloadable PDF/DOCX/XLSX/PPTX product files. Since the owner confirms the products are sold and delivered through Selar, the missing product masters are not a blocker for the Selar checkout flow. Before launch, verify that each active Selar product has its correct checkout URL and that Selar's delivery settings are active. Separately identify any app-managed freebies or downloads; only those files, and files needed to retain admin upload functionality, require durable app storage.

## Database preservation gate

Previously supplied inspection findings identify the source as the AI Studio-managed PostgreSQL 18 Developer instance `ai-studio-30836c46` in `europe-west2`, with database `cloud_sql_development_database`, role `ai_studio_app_user`, and 20 tables. The repository also defines 20 Drizzle tables but has no checked-in Drizzle migration files. Table counts/names alone do not prove identical columns, constraints, indexes, or data.

Google's current AI Studio/Cloud SQL documentation says Developer edition does not support Cloud SQL backup and recovery. A user-provided archive now contains a plain SQL logical export, a standalone schema, and read-only export/inventory reports. The archive manifest lists PostgreSQL 18.6, all 20 application tables, 32 records, 20 sequence states, and SHA-256 `5f5aebb8926d6acab7a2b800d880e18b48d98ae83c1e46b5d09e72249bbe66b1` for `cloud_sql_development_database_backup.sql`. The hash was independently recalculated and matches; a static scan found 20 table definitions, 32 INSERT statements across six populated tables, 20 sequence states, and 14 foreign keys. The archive's own report says all per-table counts match its read-only live inspection. This is evidence of a complete candidate logical export, but the dump has not yet been restored, so backup recovery is not demonstrated.

The SQL file was extracted outside Git to `C:\Users\HP\Documents\Codex\2026-11-13\d\work\recovery-review\cloud_sql_development_database_backup.sql` and restored into a disposable PostgreSQL 18.6 cluster at `localhost:55432`, database `digitalstore_restore`. The restore completed successfully with `ON_ERROR_STOP=1`. Actual table row counts, column counts, 20 sequence states, 20 primary keys, 14 foreign keys, 12 unique constraints, and zero extra indexes match the archive inventory. The current Drizzle table names match the restored database, and `SELECT * ... LIMIT 1` queries using the app's Drizzle mappings passed for all 20 tables. Read-only queries returned 4 published products with Selar links, 6 categories, and 7 settings; users, orders, and order items are empty. The four products have no native checkout eligibility or protected-file paths, so Selar is their only available fulfillment path until protected copies are uploaded. No command was run against the source database. The archive's deployment/schema-push instructions are reference text only and must not be followed against the source.

Database recovery is verified for this supplied export. Keep the AI Studio source untouched. A separate Neon Free staging project and private bucket have been created; production Neon provisioning, data migration, and cutover remain unapproved.

## Cost and billing controls (current public pricing; USD)

These are estimates, not a bill prediction. Account-level traffic, egress, image size, build frequency, and existing billing-account consumption are unknown.

| Component | Fixed monthly | Included usage / variable exposure |
|---|---:|---|
| Neon Free PostgreSQL, Frankfurt | $0 | 1 GB database, 100 CU-hours/project/month, 5 GB public transfer/project/month, 6-hour instant restore history and one manual snapshot. Free-plan compute/transfer exhaustion suspends compute; storage cap blocks writes. |
| Neon Object Storage | $0 on Free | 5 GB/project. Paid Launch rate shown by Neon is $0.023/GB-month. The app enforces a 4,000,000,000-byte aggregate cap (1 GB safety margin) using S3 ListObjectsV2 and a PostgreSQL advisory lock shared across app instances. Uploads fail closed if usage cannot be read or the cap would be exceeded. |
| Cloud Run, Frankfurt | $0 fixed with min instances 0 | Free request-based allowance: 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests/month, shared at billing-account level. Beyond that, usage is billed. Published request-based active rates are about $0.000024/vCPU-second, $0.0000025/GiB-second and $0.40/million requests; 1 vCPU + 1 GiB running for an active hour is about $0.095 before free-tier credits and other charges. |
| Cloud Build | $0 fixed | 2,500 build-minutes/month free; additional default-pool minutes are listed at $0.006/minute. |
| Artifact Registry | $0 fixed | 0.5 GiB storage/month free per billing account, then storage is usage-based. Retained image versions can exceed the allowance. |
| Resend Free | $0 | 3,000 emails/month and 100/day. If pay-as-you-go overages are not enabled, sends stop at the plan limit rather than charging automatically; a paid plan is not enabled by this preparation. |
| Paystack transactions | $0 fixed | For a Nigeria-registered account, local payments are currently listed at 1.5% + ₦100 (₦100 waived below ₦2,500; local fee capped at ₦2,000). International card and USD fees differ; check the merchant dashboard before enabling currencies. Fees are per successful transaction, not a monthly subscription. [Official pricing](https://paystack.com/pricing). |
| Firebase Authentication | Existing account billing not inspected | The current Firebase project's plan and usage were not inspected, so no account-specific price can be stated. Existing user records are not changed by these code edits. |
| Cross-cloud data transfer | No fixed fee | Cloud Run to Neon is cross-provider internet traffic. Google documents internet egress charges outside the North America free allowance; database responses and server-side uploads can therefore incur variable network charges. Product downloads use short-lived direct object URLs to avoid routing entire files through Cloud Run. |

Cloud Run requires an eligible Google Cloud billing setup for standard deployment even when usage remains within free allowances. Free-tier quotas are not a hard no-charge guarantee. Google documents enforced Cloud Run spend caps, which pause Cloud Run when reached, but they do not cap every other service in the project. Before deployment, confirm billing status, choose an enforced Cloud Run cap, set separate budget alerts for Build and Artifact Registry, and accept that reaching the cap takes the store offline. No cap or billing setting has been created here.

## Not completed / approval gates

- The supplied database export passed a disposable PostgreSQL 18.6 restore and application-facing read checks. No production migration, external service provisioning, DNS edit, deployment, billing setting, live email, or production variable change has occurred.
- Neon Object Storage signing, usage listing, aggregate capacity enforcement, and file flows have been implemented against its S3-compatible interface but have not been tested against a live Neon endpoint.
- Selar-delivered catalog products can launch without copying their masters into this app. Native Paystack is prepared but remains off for products without protected copies. Before activating Paystack for an item, configure its keys and webhook, upload that item's master to protected storage, and verify payment-to-download in staging.
- Before external setup, confirm whether the Google project has active billing and separately approve creation of the Neon Free project/bucket, Cloud Run service, Artifact Registry repository, and Secret Manager entries. Resend sending also requires a verified sender domain; its DNS records require separate approval.
- A Selar-only launch does not require app copies of product masters or Paystack secrets. Production deployment still requires provisioned Neon/Cloud Run, restored database migration after approval, durable storage, and critical Selar/customer/admin workflow verification in staging. Keep Paystack disabled for products without protected copies.
