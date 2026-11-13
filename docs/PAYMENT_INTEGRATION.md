# Jeneconk Digital Store — Payment Integration Architecture

## Stage 1: External Marketplace Checkout (Selar — Active Default)
- Products configured with `checkoutMode = 'selar'` and a valid `marketplaceUrl` route buyers directly to Selar.
- Outbound clicks are tracked separately via `POST /api/analytics/event` (`selar_outbound_click`) with UTM attribution (`utm_source=jeneconk_digital_store`).
- Confirmed sales metrics are never inferred from outbound clicks.
- Selar handles payment processing and digital file delivery for Stage 1 orders.

## Stage 2: Native Checkout (Paystack — Disabled Until Activated)
### Implemented Endpoints
- `POST /api/checkout/initialize`: Validates product eligibility (`nativeCheckoutEligible = true`) and server-side prices from PostgreSQL, applies valid discount codes, creates a `pending` order with unique reference (`JNK-...`), and initializes Paystack via `https://api.paystack.co/transaction/initialize`.
- `GET /api/checkout/verify/:reference`: Verifies transaction status, amount, and currency directly against Paystack's server API, marks the order `paid` idempotently, increments `verifiedSalesCount`, and returns expiring signed download links.
- `POST /api/webhooks/paystack`: Validates the `x-paystack-signature` header using HMAC-SHA512 over the raw request body (`req.rawBody`) and fulfils `charge.success` events idempotently.

### Placeholder Safety & Activation Steps
All Paystack environment variables (`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`) are validated at runtime in `src/lib/integrations.ts`:
- Placeholder or malformed values are automatically treated as unconfigured.
- Native checkout stays disabled (Stage 1 Selar links remain active) until **both** genuine Paystack secret keys (`sk_test_...` / `sk_live_...`) are supplied **and** **Stage 2 Native Paystack Checkout** is enabled in **Admin → Settings & Audit**.
- `POST /api/webhooks/paystack` refuses signature verification with HTTP `503` whenever `PAYSTACK_WEBHOOK_SECRET` is unset or a placeholder.

1. Replace placeholder secrets with genuine `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`, and `DOWNLOAD_SIGNING_SECRET` values in your environment secrets (no code changes needed).
2. Configure your Paystack Dashboard webhook endpoint to `https://digital.jeneconk.com/api/webhooks/paystack`.
3. Enable **Stage 2 Native Paystack Checkout** in **Admin → Settings & Audit** and verify with Paystack test keys before switching to live keys.
