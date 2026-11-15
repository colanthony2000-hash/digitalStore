# Jeneconk Digital Store — Payment Integration Architecture

## Stage 1: External Marketplace Checkout (Selar — Active Default)
- Products configured with `checkoutMode = 'selar'` and a valid `marketplaceUrl` route buyers directly to Selar.
- Outbound clicks are tracked separately via `POST /api/analytics/event` (`selar_outbound_click`) with UTM attribution (`utm_source=jeneconk_digital_store`).
- Confirmed sales metrics are never inferred from outbound clicks.
- Selar handles payment processing and digital file delivery for Stage 1 orders.

## Native Checkout (Paystack — Disabled Until Activated)
### Implemented Endpoints
- `POST /api/checkout/initialize`: Validates product eligibility (`nativeCheckoutEligible = true`) and server-side prices from PostgreSQL, applies valid discount codes, creates a `pending` order with unique reference (`JNK-...`), and initializes Paystack via `https://api.paystack.co/transaction/initialize`.
- `GET /api/checkout/verify/:reference`: Verifies transaction status, amount, and currency directly against Paystack's server API, marks the order `paid` idempotently, increments `verifiedSalesCount`, and returns expiring signed download links.
- `POST /api/webhooks/paystack`: Validates current timestamped `Paystack-Signature` webhooks, with legacy `x-paystack-signature` support, against the raw request body and fulfils `charge.success` events idempotently.

### Placeholder Safety & Activation Steps
Paystack configuration (`PAYSTACK_SECRET_KEY`, optional `PAYSTACK_PUBLIC_KEY`, and optional `PAYSTACK_WEBHOOK_SECRET`) is validated at runtime in `src/lib/integrations.ts`:
- Placeholder or malformed keys are automatically treated as unconfigured.
- Native checkout requires a valid secret key and the explicit **Native Paystack Checkout** setting in **Admin → Settings & Audit**. Selar checkout links remain available independently for products with a Selar URL.
- New `Paystack-Signature` webhooks are checked with `PAYSTACK_WEBHOOK_SECRET` using the timestamped signature format. Older `x-paystack-signature` events are checked with `PAYSTACK_SECRET_KEY` while Paystack continues to send that header.
- Native checkout refuses to initialize an order unless every selected product has a protected file path and the file is present in the configured storage. This avoids accepting payment for a download the app cannot deliver. Selar-delivered products do not require their master files to be copied into this application unless they are also enabled for native checkout.

1. Store genuine Paystack test credentials in the server environment. `PAYSTACK_SECRET_KEY` is required; `PAYSTACK_WEBHOOK_SECRET` should be set for the current signed webhook protocol. Keep the download signing key in Secret Manager.
2. Configure your Paystack Dashboard webhook endpoint to `https://digital.jeneconk.com/api/webhooks/paystack`.
3. Upload and verify each native-eligible product file in protected object storage, then enable **Native Paystack Checkout** in **Admin → Settings & Audit** and verify with Paystack test credentials before switching to live credentials.
