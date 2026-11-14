import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  accountEvents,
  downloadLogs,
  orderItems,
  orders,
  products,
  supportCases,
  supportEnquiries,
  users,
} from '../db/schema.ts';
import {
  requireActiveAccount,
  requireAuth,
  type AuthRequest,
} from '../middleware/auth.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getPermissionsForRole } from '../lib/rbac.ts';
import {
  createRateLimiter,
  signDownloadToken,
  verifyDownloadToken,
} from '../lib/security.ts';
import { sendTransactionalEmail } from '../lib/email.ts';
import { recordAccountEvent, recordSystemEvent } from '../lib/telemetry.ts';

const router = Router();
const PROTECTED_STORAGE_DIR = path.resolve(
  process.cwd(),
  'storage',
  'protected_products'
);
const customerWriteLimiter = createRateLimiter(30, 60_000);

router.get('/account/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;

    const [userOrders, downloads, enquiries, cases, timeline] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(eq(orders.userId, dbUser.id))
        .orderBy(desc(orders.createdAt)),
      db
        .select()
        .from(downloadLogs)
        .where(eq(downloadLogs.userId, dbUser.id))
        .orderBy(desc(downloadLogs.downloadedAt))
        .limit(50),
      db
        .select()
        .from(supportEnquiries)
        .where(eq(supportEnquiries.userId, dbUser.id))
        .orderBy(desc(supportEnquiries.createdAt)),
      db
        .select({
          id: supportCases.id,
          caseReference: supportCases.caseReference,
          userId: supportCases.userId,
          customerName: supportCases.customerName,
          customerEmail: supportCases.customerEmail,
          category: supportCases.category,
          subject: supportCases.subject,
          description: supportCases.description,
          relatedProductSlug: supportCases.relatedProductSlug,
          relatedOrderId: supportCases.relatedOrderId,
          transactionReference: supportCases.transactionReference,
          status: supportCases.status,
          priority: supportCases.priority,
          assignedAdminEmail: supportCases.assignedAdminEmail,
          resolutionSummary: supportCases.resolutionSummary,
          resolutionHistory: supportCases.resolutionHistory,
          resolvedAt: supportCases.resolvedAt,
          createdAt: supportCases.createdAt,
          updatedAt: supportCases.updatedAt,
        })
        .from(supportCases)
        .where(eq(supportCases.userId, dbUser.id))
        .orderBy(desc(supportCases.createdAt)),
      db
        .select()
        .from(accountEvents)
        .where(eq(accountEvents.userId, dbUser.id))
        .orderBy(desc(accountEvents.createdAt))
        .limit(30),
    ]);

    const orderIds = userOrders.map((o) => o.id);
    const items =
      orderIds.length > 0
        ? await db
            .select()
            .from(orderItems)
            .where(inArray(orderItems.orderId, orderIds))
        : [];

    const ordersWithItems = userOrders.map((o) => ({
      ...o,
      items: items.filter((item) => item.orderId === o.id),
    }));

    // Return clean profile without internal admin notes
    const { internalNotes: _hiddenNotes, ...safeUser } = dbUser;

    res.json({
      user: {
        ...safeUser,
        permissions: getPermissionsForRole(dbUser.role),
      },
      orders: ordersWithItems,
      downloads,
      enquiries,
      supportCases: cases,
      activityTimeline: timeline,
      marketplaceNotice:
        'Purchases completed externally on Selar are delivered directly via your Selar account and email receipt. Only native Jeneconk store orders appear in this order history.',
    });
  } catch (error) {
    console.error('Error fetching account dashboard:', error);
    res.status(500).json({ error: 'Unable to load customer dashboard.' });
  }
});

router.patch(
  '/account/me',
  requireAuth,
  requireActiveAccount,
  customerWriteLimiter,
  async (req: AuthRequest, res) => {
    try {
      const { fullName } = req.body || {};
      if (typeof fullName !== 'string' || !fullName.trim()) {
        return res.status(400).json({ error: 'Full name is required.' });
      }

      const updated = await db
        .update(users)
        .set({
          fullName: fullName.trim().slice(0, 120),
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      await recordAccountEvent({
        userId: req.dbUser!.id,
        email: req.dbUser!.email,
        eventType: 'profile_updated',
        details: 'Customer updated full name.',
      });

      const { internalNotes: _hiddenNotes, ...safeUser } = updated[0];
      res.json({
        user: {
          ...safeUser,
          permissions: getPermissionsForRole(safeUser.role),
        },
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Unable to update profile.' });
    }
  }
);

router.post(
  '/account/session-invalidate',
  requireAuth,
  customerWriteLimiter,
  async (req: AuthRequest, res) => {
    try {
      const reason =
        typeof req.body?.reason === 'string'
          ? req.body.reason.slice(0, 120)
          : 'session_refresh';

      await db
        .update(users)
        .set({
          sessionInvalidatedBefore: new Date(),
          lastPasswordResetAt:
            reason === 'password_reset' ? new Date() : req.dbUser!.lastPasswordResetAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.dbUser!.id));

      try {
        await adminAuth.revokeRefreshTokens(req.dbUser!.uid);
      } catch {
        // DB sessionInvalidatedBefore remains active even if GCP Admin SDK IAM is absent
      }

      await recordAccountEvent({
        userId: req.dbUser!.id,
        email: req.dbUser!.email,
        eventType: 'session_revoked',
        details: `Prior sessions invalidated (${reason}).`,
      });

      res.json({ invalidated: true });
    } catch (error) {
      console.error('Error invalidating sessions:', error);
      res.status(500).json({ error: 'Unable to invalidate prior sessions.' });
    }
  }
);

router.post(
  '/account/support-cases',
  requireAuth,
  requireActiveAccount,
  customerWriteLimiter,
  async (req: AuthRequest, res) => {
    try {
      const { category, subject, description, relatedProductSlug, transactionReference } =
        req.body || {};

      if (
        typeof subject !== 'string' ||
        subject.trim().length < 3 ||
        typeof description !== 'string' ||
        description.trim().length < 10
      ) {
        return res.status(400).json({
          error: 'Please enter a subject and at least 10 characters describing your issue.',
        });
      }

      const dbUser = req.dbUser!;
      const caseReference = `JNK-SUP-${Date.now().toString(36).toUpperCase()}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;

      let relatedOrderId: number | null = null;
      const cleanTxRef =
        typeof transactionReference === 'string' && transactionReference.trim()
          ? transactionReference.trim().slice(0, 120)
          : null;

      if (cleanTxRef) {
        const matchedOrders = await db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.userId, dbUser.id),
              eq(orders.orderReference, cleanTxRef)
            )
          )
          .limit(1);
        if (matchedOrders.length > 0) {
          relatedOrderId = matchedOrders[0].id;
        }
      }

      const [created] = await db
        .insert(supportCases)
        .values({
          caseReference,
          userId: dbUser.id,
          customerName: dbUser.fullName || dbUser.email,
          customerEmail: dbUser.email,
          category:
            typeof category === 'string' && category.trim()
              ? category.trim().slice(0, 60)
              : 'general_enquiry',
          subject: subject.trim().slice(0, 180),
          description: description.trim().slice(0, 4000),
          relatedProductSlug:
            typeof relatedProductSlug === 'string' && relatedProductSlug.trim()
              ? relatedProductSlug.trim().slice(0, 120)
              : null,
          relatedOrderId,
          transactionReference: cleanTxRef,
          status: 'open',
          priority: 'normal',
          resolutionHistory: [
            {
              timestamp: new Date().toISOString(),
              actorEmail: dbUser.email,
              action: 'CASE_CREATED',
              note: 'Opened from Customer Account Support section.',
            },
          ],
        })
        .returning();

      await recordAccountEvent({
        userId: dbUser.id,
        email: dbUser.email,
        eventType: 'support_case_opened',
        details: `Case ${caseReference}: ${created.subject}`,
      });

      await sendTransactionalEmail({
        to: 'info@jeneconk.com',
        replyTo: dbUser.email,
        subject: `[${caseReference}] Customer Support Case: ${created.subject}`,
        text: `Case: ${caseReference}\nCustomer: ${created.customerName} (${created.customerEmail})\nCategory: ${created.category}\nTransaction Ref: ${
          cleanTxRef || 'N/A'
        }\n\n${created.description}`,
        category: 'support_notification',
      });

      const { internalNotes: _hidden, ...safeCase } = created;
      res.status(201).json({ supportCase: safeCase });
    } catch (error) {
      console.error('Error creating support case:', error);
      res.status(500).json({ error: 'Unable to submit support case.' });
    }
  }
);

router.post(
  '/account/download-link',
  requireAuth,
  requireActiveAccount,
  async (req: AuthRequest, res) => {
    try {
      const { orderItemId } = req.body || {};
      if (typeof orderItemId !== 'number') {
        return res.status(400).json({ error: 'Order item ID is required.' });
      }

      const itemRows = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.id, orderItemId))
        .limit(1);

      if (itemRows.length === 0) {
        return res.status(404).json({ error: 'Purchased item not found.' });
      }

      const item = itemRows[0];
      const orderRows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, item.orderId), eq(orders.userId, req.dbUser!.id)))
        .limit(1);

      if (orderRows.length === 0) {
        return res.status(403).json({ error: 'Order does not belong to your account.' });
      }

      if (orderRows[0].paymentStatus !== 'paid') {
        return res.status(403).json({ error: 'Payment has not been verified for this order.' });
      }

      if (item.downloadCount >= item.maxDownloads) {
        return res.status(403).json({
          error: 'Download limit reached for this licence. Please contact Jeneconk support.',
        });
      }

      if (!item.productId) {
        return res.status(404).json({ error: 'Product record is no longer attached.' });
      }

      let token: string;
      try {
        token = signDownloadToken({
          productId: item.productId,
          orderItemId: item.id,
          userId: req.dbUser!.id,
          email: req.dbUser!.email,
        });
      } catch (err: any) {
        await recordSystemEvent({
          component: 'storage',
          severity: 'error',
          eventType: 'download_signing_unavailable',
          message: 'Download signing secret unavailable when generating link.',
          details: err?.message,
        });
        return res.status(503).json({
          error: 'Protected download signing is not configured on the server.',
        });
      }

      res.json({
        downloadUrl: `/api/downloads/${token}`,
        expiresInSeconds: 900,
      });
    } catch (error) {
      console.error('Error generating download link:', error);
      res.status(500).json({ error: 'Unable to issue signed download link.' });
    }
  }
);

router.get('/downloads/:token', async (req, res) => {
  try {
    const payload = verifyDownloadToken(req.params.token);
    if (!payload) {
      return res.status(403).json({
        error:
          'This download link is invalid or has expired. Please request a fresh download link.',
      });
    }

    const prodRows = await db
      .select()
      .from(products)
      .where(eq(products.id, payload.productId))
      .limit(1);

    if (prodRows.length === 0) {
      return res.status(404).json({ error: 'Digital product not found.' });
    }

    const product = prodRows[0];

    if (payload.orderItemId === null && !product.isFree) {
      return res.status(403).json({ error: 'Unauthorized download request.' });
    }

    if (payload.userId) {
      const ownerRows = await db
        .select({ accountStatus: users.accountStatus })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);
      if (ownerRows[0]?.accountStatus === 'suspended') {
        return res.status(403).json({
          error: 'Account suspended. Contact info@jeneconk.com for assistance.',
        });
      }
    }

    if (payload.orderItemId !== null) {
      const itemRows = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.id, payload.orderItemId))
        .limit(1);

      if (itemRows.length === 0) {
        return res.status(403).json({ error: 'Order item not found.' });
      }
      if (itemRows[0].productId !== payload.productId) {
        return res.status(403).json({ error: 'Download link does not match the purchased product.' });
      }
      const orderRows = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, itemRows[0].orderId))
        .limit(1);
      if (orderRows[0]?.paymentStatus !== 'paid') {
        return res.status(403).json({ error: 'Payment is not eligible for download.' });
      }
      if (itemRows[0].downloadCount >= itemRows[0].maxDownloads) {
        return res.status(403).json({ error: 'Download limit reached.' });
      }
    }

    let resolvedPath: string | null = null;
    if (product.protectedFilePath) {
      const candidate = path.resolve(
        PROTECTED_STORAGE_DIR,
        path.basename(product.protectedFilePath)
      );
      if (
        candidate.startsWith(PROTECTED_STORAGE_DIR + path.sep) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        resolvedPath = candidate;
      }
    }

    if (!resolvedPath) {
      await recordSystemEvent({
        component: 'storage',
        severity: 'error',
        eventType: 'protected_file_missing',
        message: `Protected digital file missing for product "${product.name}" (${product.slug}).`,
        details: `Expected filename: ${product.protectedFilePath || 'unset'}`,
      });
      return res.status(404).json({
        error:
          'This digital file is currently unavailable for download. No download attempt has been deducted from your licence. Please contact info@jeneconk.com.',
      });
    }

    if (payload.orderItemId !== null) {
      const updatedItems = await db
        .update(orderItems)
        .set({ downloadCount: sql`${orderItems.downloadCount} + 1` })
        .where(
          and(
            eq(orderItems.id, payload.orderItemId),
            sql`${orderItems.downloadCount} < ${orderItems.maxDownloads}`
          )
        )
        .returning({ id: orderItems.id });

      if (updatedItems.length === 0) {
        return res.status(403).json({ error: 'Download limit reached.' });
      }
    }

    await db.insert(downloadLogs).values({
      orderItemId: payload.orderItemId,
      productId: product.id,
      userId: payload.userId,
      email: payload.email,
      ipAddress: (req.ip || req.socket.remoteAddress || '').slice(0, 64),
    });

    const ext = path.extname(resolvedPath) || `.${product.fileFormat.toLowerCase()}`;
    return res.download(resolvedPath, `${product.slug}-v${product.version}${ext}`);
  } catch (error: any) {
    console.error('Error serving protected download:', error);
    await recordSystemEvent({
      component: 'storage',
      severity: 'error',
      eventType: 'download_delivery_error',
      message: 'Unexpected error serving protected download.',
      details: error?.message,
    });
    res.status(500).json({ error: 'Unable to process protected download.' });
  }
});

export default router;
