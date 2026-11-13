# Jeneconk Digital Store — Testing & Verification Report

## 1. Build & Static Analysis
- `npm run lint` (`tsc --noEmit`): **PASS** (0 errors)
- `npm run build` (`vite build`): **PASS** (bundle compiled cleanly)

## 2. Database Schema Verification
- Cloud SQL PostgreSQL schema pushed via Drizzle (`src/db/schema.ts`, `src/db/drizzle.config.ts`).
- Verified 15 tables via `information_schema.columns`: `analytics_events`, `audit_logs`, `bundle_items`, `bundles`, `categories`, `collections`, `discount_codes`, `download_logs`, `newsletter_subscribers`, `order_items`, `orders`, `products`, `store_settings`, `support_enquiries`, `users`.

## 3. Live Server & API Endpoint Verification (`http://127.0.0.1:3000`)
| Test Case | Expected | Observed | Result |
| --- | --- | --- | --- |
| `GET /` (Storefront SPA) | 200 | 200 | PASS |
| `GET /api/storefront` (Departments, products, collections, settings) | 200 | 200 | PASS |
| `GET /api/products?search=Life` | 200 | 200 | PASS |
| `GET /api/products/life-reset` | 200 | 200 | PASS |
| `GET /api/products/christmas-planner` | 200 | 200 | PASS |
| `GET /api/admin/overview` (unauthenticated RBAC guard) | 401 | 401 | PASS |
| `GET /api/account/me` (unauthenticated auth guard) | 401 | 401 | PASS |
| `GET /api/downloads/invalid-token` (HMAC download guard) | 403 | 403 | PASS |
| `GET /sitemap.xml` | 200 | 200 | PASS |
| `GET /robots.txt` | 200 | 200 | PASS |
| `POST /api/newsletter/subscribe` | 200 | 200 | PASS |
| `POST /api/support/enquiry` | 201 | 201 | PASS |
| `POST /api/checkout/initialize` (Stage 2 disabled guard) | 400 | 400 | PASS |
| `GET /api/checkout/verify/JNK-TEST` (Stage 2 disabled guard) | 400 | 400 | PASS |
| `POST /api/webhooks/paystack` (Placeholder/unset webhook guard) | 503 | 503 | PASS |
| Database Product Lifecycle (Create -> Draft/Unpublish -> Publish -> Delete) | 200 -> 404 -> 200 | 200 -> 404 -> 200 | PASS |

## 4. Optional Integrations & Placeholder Safety
- **Paystack Native Checkout & Webhooks**: Placeholder/malformed secrets are rejected in `src/lib/integrations.ts`. `POST /api/webhooks/paystack` returns `503` without attempting HMAC verification when `PAYSTACK_WEBHOOK_SECRET` is unset or a placeholder. Stage 1 external Selar checkout remains active (`nativeCheckoutEnabled: false`).
- **Pinterest Tag (`PINTEREST_TAG_ID`)**: `AnalyticsScripts` does not inject `pintrk` or `https://s.pinimg.com/ct/core.js` when `PINTEREST_TAG_ID` is unset or a placeholder. Replacing placeholders with genuine numeric Tag IDs or genuine Paystack credentials activates them automatically without code changes.

## 5. Fresh Restart & Persistence Check
- Restarted server cleanly on port `3000` and re-verified PostgreSQL persistence across 6 departments, `life-reset`, `christmas-planner`, 5 curated collections, and `store_settings`.
