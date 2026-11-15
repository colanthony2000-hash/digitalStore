import crypto from 'crypto';
import { Router } from 'express';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  discountCodes,
  orderItems,
  orders,
  products,
  storeSettings,
} from '../db/schema.ts';
import { optionalAuth, type AuthRequest } from '../middleware/auth.ts';
import { createRateLimiter, signDownloadToken } from '../lib/security.ts';
import { getPaystackConfig, verifyPaystackWebhookSignature } from '../lib/integrations.ts';
import { recordSystemEvent } from '../lib/telemetry.ts';
import { objectExists, objectKeyFromProductPath } from '../lib/object-storage.ts';

const router = Router();
const checkoutLimiter = createRateLimiter(15, 60_000);
const verifyLimiter = createRateLimiter(30, 60_000);

async function getActivePaystackConfig() {
  const rows = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.key, 'native_checkout_enabled'))
    .limit(1);
  const toggled = rows.length > 0 && rows[0].value === 'true';
  return getPaystackConfig(toggled);
}

router.post('/checkout/initialize', checkoutLimiter, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const paystack = await getActivePaystackConfig();
    if (!paystack.nativeCheckoutActive) {
      return res.status(400).json({
        error:
          'Native Paystack checkout is currently disabled. Please complete purchases via the official Selar checkout link on each product page.',
      });
    }

    const { productIds, currency = 'NGN', customerEmail, customerName, discountCode } =
      req.body || {};

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one product to purchase.' });
    }
    if (currency !== 'NGN' && currency !== 'USD') {
      return res.status(400).json({ error: 'Unsupported payment currency.' });
    }
    const email = (req.dbUser?.email || customerEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid customer email is required for receipt and delivery.' });
    }

    const cleanIds = productIds.filter((id): id is number => typeof id === 'number');
    const dbProducts = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, cleanIds),
          eq(products.status, 'published'),
          eq(products.nativeCheckoutEligible, true)
        )
      );

    if (dbProducts.length === 0 || dbProducts.length !== cleanIds.length) {
      return res.status(400).json({
        error: 'One or more selected products are not enabled for native checkout.',
      });
    }

    const deliveryReady = await Promise.all(
      dbProducts.map(async (product) => {
        if (!product.protectedFilePath) return false;
        return objectExists(objectKeyFromProductPath(product.protectedFilePath));
      })
    );
    if (deliveryReady.some((ready) => !ready)) {
      return res.status(409).json({
        error:
          'Native checkout is unavailable for a selected product until its protected download file is uploaded and verified. Selar checkout remains available.',
      });
    }

    let subtotalMinor = 0;
    const itemSnapshots = dbProducts.map((p) => {
      const unitPriceMinor =
        currency === 'NGN' ? p.priceNgnKobo : p.priceUsdCents;
      if (unitPriceMinor === null || unitPriceMinor <= 0) {
        throw new Error(`Product "${p.name}" does not have a valid ${currency} price configured.`);
      }
      subtotalMinor += unitPriceMinor;
      return {
        productId: p.id,
        productName: p.name,
        productVersion: p.version,
        unitPriceMinor,
      };
    });

    let discountMinor = 0;
    let appliedCode: string | null = null;
    if (typeof discountCode === 'string' && discountCode.trim()) {
      const dcRows = await db
        .select()
        .from(discountCodes)
        .where(
          and(
            eq(discountCodes.code, discountCode.trim().toUpperCase()),
            eq(discountCodes.isActive, true)
          )
        )
        .limit(1);
      if (dcRows.length > 0) {
        const dc = dcRows[0];
        const notExpired = !dc.expiresAt || dc.expiresAt.getTime() > Date.now();
        const hasCapacity = dc.maxUses === null || dc.usedCount < dc.maxUses;
        if (notExpired && hasCapacity) {
          appliedCode = dc.code;
          if (dc.discountType === 'percent') {
            discountMinor = Math.round((subtotalMinor * dc.value) / 100);
          } else if (dc.discountType === 'fixed_ngn' && currency === 'NGN') {
            discountMinor = Math.min(subtotalMinor, dc.value * 100);
          } else if (dc.discountType === 'fixed_usd' && currency === 'USD') {
            discountMinor = Math.min(subtotalMinor, dc.value * 100);
          }
        }
      }
    }

    const totalMinor = Math.max(0, subtotalMinor - discountMinor);
    const orderReference = `JNK-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderReference,
        userId: req.dbUser?.id ?? null,
        customerEmail: email,
        customerName:
          typeof customerName === 'string'
            ? customerName.trim().slice(0, 120)
            : req.dbUser?.fullName || null,
        currency,
        subtotalMinor,
        discountMinor,
        totalMinor,
        discountCode: appliedCode,
        paymentProvider: 'paystack',
        paymentStatus: 'pending',
        orderStatus: 'created',
        checkoutDestination: 'native',
        fulfilmentStatus: 'pending',
        paystackReference: orderReference,
      })
      .returning();

    await db.insert(orderItems).values(
      itemSnapshots.map((item) => ({
        orderId: createdOrder.id,
        ...item,
      }))
    );

    const callbackBase =
      process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')
        ? process.env.APP_URL
        : `${req.protocol}://${req.get('host')}`;

    const paystackResp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystack.secretKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        email,
        amount: totalMinor,
        currency,
        reference: orderReference,
        callback_url: `${callbackBase.replace(/\/$/, '')}/account?checkout_ref=${encodeURIComponent(orderReference)}`,
        metadata: {
          orderId: createdOrder.id,
          orderReference,
        },
      }),
    });

    const paystackData = (await paystackResp.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; access_code?: string; reference?: string };
    };

    if (!paystackResp.ok || !paystackData.status || !paystackData.data?.authorization_url) {
      return res.status(502).json({
        error: paystackData.message || 'Unable to initialize Paystack transaction.',
      });
    }

    res.json({
      orderReference,
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code,
    });
  } catch (error: any) {
    console.error('Error initializing checkout:', error);
    res.status(500).json({ error: error?.message || 'Unable to start checkout.' });
  }
});

export async function fulfillVerifiedOrder(reference: string, paidAmount: number, paidCurrency: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.paystackReference, reference)).limit(1);
    if (!order) return null;
    if (order.paymentProvider !== 'paystack' || order.checkoutDestination !== 'native') {
      return null;
    }

    if (order.paymentStatus === 'paid') {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      return { order, items, alreadyVerified: true };
    }

    if (!['pending', 'failed'].includes(order.paymentStatus)) {
      throw new Error(`Order cannot be fulfilled from payment state: ${order.paymentStatus}.`);
    }
    if (paidAmount !== order.totalMinor || paidCurrency.toUpperCase() !== order.currency.toUpperCase()) {
      throw new Error('Verified payment amount or currency mismatch.');
    }

    // The conditional update makes fulfillment idempotent if webhook and browser/admin verification race.
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        paymentStatus: 'paid',
        orderStatus: 'completed',
        fulfilmentStatus: 'fulfilled',
        verifiedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), inArray(orders.paymentStatus, ['pending', 'failed'])))
      .returning();

    if (!updatedOrder) {
      const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      if (current?.paymentStatus === 'paid') return { order: current, items, alreadyVerified: true };
      throw new Error('Order payment state changed during verification; no fulfillment was applied.');
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      if (item.productId) {
        await tx.update(products)
          .set({ verifiedSalesCount: sql`${products.verifiedSalesCount} + 1` })
          .where(eq(products.id, item.productId));
      }
    }
    if (order.discountCode) {
      await tx.update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.code, order.discountCode));
    }
    return { order: updatedOrder, items, alreadyVerified: false };
  });
}

router.get('/checkout/verify/:reference', verifyLimiter, async (req, res) => {
  try {
    const paystack = await getActivePaystackConfig();
    if (!paystack.nativeCheckoutActive) {
      return res.status(400).json({
        error: 'Native Paystack checkout is currently disabled.',
      });
    }
    const { reference } = req.params;
    const resp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${paystack.secretKey}`,
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    const payload = (await resp.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number; currency?: string };
    };

    if (!resp.ok || !payload.status || payload.data?.status !== 'success') {
      return res.status(400).json({ error: 'Payment could not be verified as successful.' });
    }

    const result = await fulfillVerifiedOrder(
      reference,
      payload.data.amount || 0,
      payload.data.currency || 'NGN'
    );

    if (!result) {
      return res.status(404).json({ error: 'Order reference not found.' });
    }

    const downloadLinks = result.items
      .filter((item) => item.productId !== null)
      .map((item) => ({
        orderItemId: item.id,
        productName: item.productName,
        downloadUrl: `/api/downloads/${signDownloadToken({
          productId: item.productId!,
          orderItemId: item.id,
          userId: result.order.userId,
          email: result.order.customerEmail,
        })}`,
      }));

    res.json({
      verified: true,
      order: {
        orderReference: result.order.orderReference,
        currency: result.order.currency,
        totalMinor: result.order.totalMinor,
        paymentStatus: result.order.paymentStatus,
        orderStatus: result.order.orderStatus,
      },
      items: result.items,
      downloadLinks,
    });
  } catch (error: any) {
    console.error('Error verifying Paystack transaction:', error);
    res.status(500).json({ error: error?.message || 'Payment verification failed.' });
  }
});

router.post('/webhooks/paystack', async (req, res) => {
  try {
    const paystack = await getActivePaystackConfig();
    if (!paystack.webhookVerificationConfigured) {
      return res.status(503).json({
        received: false,
        disabled: true,
        error: 'Paystack webhook signature verification is not configured.',
      });
    }

    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      return res.status(400).json({ error: 'Missing signature or payload.' });
    }

    const validSignature = verifyPaystackWebhookSignature(
      {
        paystackSignature: req.headers['paystack-signature'],
        legacySignature: req.headers['x-paystack-signature'],
      },
      rawBody,
      paystack
    );
    if (!validSignature) {
      await recordSystemEvent({
        component: 'payments',
        severity: 'warning',
        eventType: 'paystack_webhook_invalid_signature',
        message: 'Rejected Paystack webhook due to invalid HMAC signature.',
      });
      return res.status(401).json({ error: 'Invalid Paystack webhook signature.' });
    }

    const event = req.body as {
      event?: string;
      data?: { reference?: string; amount?: number; currency?: string };
    };

    if (event.event === 'charge.success' && event.data?.reference) {
      await fulfillVerifiedOrder(
        event.data.reference,
        event.data.amount || 0,
        event.data.currency || 'NGN'
      );
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Paystack webhook error:', error);
    await recordSystemEvent({
      component: 'payments',
      severity: 'error',
      eventType: 'paystack_webhook_error',
      message: 'Paystack webhook processing error.',
      details: error?.message,
    });
    res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

export default router;
