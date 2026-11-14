import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  downloadLogs,
  orderItems,
  orders,
  products,
  supportEnquiries,
  users,
} from '../db/schema.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { signDownloadToken, verifyDownloadToken } from '../lib/security.ts';

const router = Router();
const PROTECTED_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'protected_products');

router.get('/account/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;

    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, dbUser.id))
      .orderBy(desc(orders.createdAt));

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

    const downloads = await db
      .select()
      .from(downloadLogs)
      .where(eq(downloadLogs.userId, dbUser.id))
      .orderBy(desc(downloadLogs.downloadedAt))
      .limit(50);

    const enquiries = await db
      .select()
      .from(supportEnquiries)
      .where(eq(supportEnquiries.userId, dbUser.id))
      .orderBy(desc(supportEnquiries.createdAt));

    res.json({
      user: dbUser,
      orders: ordersWithItems,
      downloads,
      enquiries,
      marketplaceNotice:
        'Purchases completed externally on Selar are delivered directly via your Selar account and email receipt. Only native Jeneconk store orders appear in this order history.',
    });
  } catch (error) {
    console.error('Error fetching account dashboard:', error);
    res.status(500).json({ error: 'Unable to load customer dashboard.' });
  }
});

router.patch('/account/me', requireAuth, async (req: AuthRequest, res) => {
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

    res.json({ user: updated[0] });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

router.post('/account/download-link', requireAuth, async (req: AuthRequest, res) => {
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
    } catch {
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
});

router.get('/downloads/:token', async (req, res) => {
  try {
    const payload = verifyDownloadToken(req.params.token);
    if (!payload) {
      return res.status(403).json({
        error: 'This download link is invalid or has expired. Please request a fresh download link.',
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

    // Check licence quota BEFORE checking/deducting
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

    // Verify protected file exists on disk BEFORE deducting any download attempt
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
      return res.status(404).json({
        error:
          'This digital file is currently unavailable for download. No download attempt has been deducted from your licence. Please contact support@jeneconk.com.',
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
  } catch (error) {
    console.error('Error serving protected download:', error);
    res.status(500).json({ error: 'Unable to process protected download.' });
  }
});

export default router;
