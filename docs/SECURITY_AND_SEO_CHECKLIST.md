# Security & SEO Verification Checklist

## Security Controls Implemented
- [x] **No Card Data Stored**: Native checkout delegates card handling strictly to Paystack.
- [x] **Server-Side Payment Verification**: Client confirmation is never trusted; orders are verified via Paystack REST API and HMAC-SHA512 webhook signature validation (`req.rawBody`).
- [x] **Duplicate Order Protection**: Unique `order_reference` and `paystack_reference` constraints plus idempotent fulfilment checks.
- [x] **Protected File Storage**: Paid downloadable assets live in `storage/protected_products/` outside static serving and require a valid HMAC-SHA256 signed token (`/api/downloads/:token`, 15-minute TTL, download limit enforcement).
- [x] **RBAC & Auth**: Firebase ID tokens verified server-side via `firebase-admin` on `/api/account/*` and `/api/admin/*`, with role checks (`role === 'admin'`).
- [x] **Rate Limiting & Audit Logs**: Applied across public submission, checkout, and admin endpoints; administrative mutations recorded in `audit_logs`.

## SEO & Pinterest Discovery Implemented
- [x] **Clean Product URLs**: `/products/life-reset`, `/products/christmas-planner`, `/categories/:slug`.
- [x] **Dynamic Metadata (`SeoHead`)**: Unique `<title>`, `<meta name="description">`, canonical URLs, Open Graph, and Twitter card tags per route.
- [x] **Structured Data**: Schema.org `Store` on homepage and `Product` JSON-LD on product pages without fabricated ratings or reviews.
- [x] **Dynamic XML Sitemap & Robots**: Served live from `/sitemap.xml` and `/robots.txt` (disallowing `/admin`, `/account`, `/api/`).
- [x] **Pinterest Readiness**: Vertical `3:4` product covers, Pinterest Save links, `@jeneconkglobal` business profile linking, and conditional `pintrk` initialization (`AnalyticsScripts`) that stays completely disabled when `PINTEREST_TAG_ID` is unset or a placeholder.
