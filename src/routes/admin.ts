import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Router } from 'express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  analyticsEvents,
  auditLogs,
  accountEvents,
  bundleItems,
  bundles,
  categories,
  collections,
  discountCodes,
  downloadLogs,
  ecosystemPlatforms,
  emailLogs,
  newsletterSubscribers,
  orderItems,
  orders,
  products,
  storeSettings,
  supportCases,
  supportEnquiries,
  systemEvents,
  users,
} from '../db/schema.ts';
import {
  requireAdmin,
  requirePermission,
  requireRecentReauth,
  type AuthRequest,
} from '../middleware/auth.ts';
import { createRateLimiter, isDownloadSigningSecretConfigured, recordAuditLog, signDownloadToken } from '../lib/security.ts';
import { getPermissionsForRole, hasPermission } from '../lib/rbac.ts';
import { getEmailIntegrationStatus, sendTransactionalEmail } from '../lib/email.ts';
import { gatherInfrastructureReport } from '../lib/infrastructure.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { fulfillVerifiedOrder } from './checkout.ts';
import {
  getGoogleAnalyticsConfig,
  getPaystackConfig,
  getPinterestConfig,
} from '../lib/integrations.ts';

const router = Router();
const adminLimiter = createRateLimiter(120, 60_000);
const adminEmailTestLimiter = createRateLimiter(5, 60 * 60_000);

const PUBLIC_UPLOAD_DIR = path.resolve(process.cwd(), 'storage', 'public_uploads');
const PROTECTED_UPLOAD_DIR = path.resolve(
  process.cwd(),
  'storage',
  'protected_products'
);

fs.mkdirSync(PUBLIC_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PROTECTED_UPLOAD_DIR, { recursive: true });

const MIME_TO_IMAGE_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PUBLIC_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safeExt = MIME_TO_IMAGE_EXT[file.mimetype] || '.png';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!MIME_TO_IMAGE_EXT[file.mimetype]) {
      return cb(new Error('Only JPG, PNG, WebP, or AVIF images are permitted.'));
    }
    cb(null, true);
  },
});

const productFileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PROTECTED_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(requireAdmin, adminLimiter);

router.get('/overview', requirePermission('view_overview'), async (req: AuthRequest, res) => {
  try {
    const [
      allProducts,
      allCategories,
      allBundles,
      allCollections,
      allPlatforms,
      allOrders,
      allOrderItems,
      allUsers,
      allEvents,
      allSubscribers,
      allEnquiries,
      allDiscounts,
      allSettings,
      recentAudits,
      allSupportCases,
      recentAccountActivity,
      allEmailLogs,
      unresolvedEvents,
      downloadCounts,
    ] = await Promise.all([
      db
        .select()
        .from(products)
        .orderBy(asc(products.sortOrder), desc(products.updatedAt)),
      db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
      db.select().from(bundles).orderBy(desc(bundles.createdAt)),
      db.select().from(collections).orderBy(asc(collections.sortOrder)),
      db
        .select()
        .from(ecosystemPlatforms)
        .orderBy(asc(ecosystemPlatforms.sortOrder), asc(ecosystemPlatforms.id)),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select().from(orderItems),
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(analyticsEvents).orderBy(desc(analyticsEvents.createdAt)).limit(500),
      db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.subscribedAt)),
      db.select().from(supportEnquiries).orderBy(desc(supportEnquiries.createdAt)),
      db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt)),
      db.select().from(storeSettings),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50),
      db.select().from(supportCases).orderBy(desc(supportCases.updatedAt)).limit(500),
      db.select().from(accountEvents).orderBy(desc(accountEvents.createdAt)).limit(100),
      db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(100),
      db.select({ id: systemEvents.id }).from(systemEvents).where(eq(systemEvents.resolved, false)),
      db.execute(sql`SELECT COUNT(*)::int AS total FROM download_logs`),
    ]);

    const paidOrders = allOrders.filter((o) => o.paymentStatus === 'paid');
    const confirmedRevenueNgnKobo = paidOrders
      .filter((o) => o.currency === 'NGN')
      .reduce((sum, o) => sum + o.totalMinor, 0);
    const confirmedRevenueUsdCents = paidOrders
      .filter((o) => o.currency === 'USD')
      .reduce((sum, o) => sum + o.totalMinor, 0);

    const productViews = allEvents.filter((e) => e.eventType === 'product_view').length;
    const outboundSelarClicks = allEvents.filter(
      (e) => e.eventType === 'selar_outbound_click'
    ).length;
    const freeDownloads = allEvents.filter(
      (e) => e.eventType === 'free_resource_download'
    ).length;

    const trafficSources = new Map<string, number>();
    const geoCounts = new Map<string, number>();
    const productStats = new Map<
      string,
      { views: number; selarClicks: number }
    >();

    for (const ev of allEvents) {
      const source =
        ev.utmSource ||
        (ev.referrer && ev.referrer.includes('pinterest')
          ? 'pinterest'
          : ev.referrer && ev.referrer.includes('google')
          ? 'google_organic'
          : ev.referrer
          ? 'referral'
          : 'direct');
      trafficSources.set(source, (trafficSources.get(source) || 0) + 1);

      if (ev.countryCode) {
        geoCounts.set(ev.countryCode, (geoCounts.get(ev.countryCode) || 0) + 1);
      }

      if (ev.productSlug) {
        const cur = productStats.get(ev.productSlug) || {
          views: 0,
          selarClicks: 0,
        };
        if (ev.eventType === 'product_view') cur.views += 1;
        if (ev.eventType === 'selar_outbound_click') cur.selarClicks += 1;
        productStats.set(ev.productSlug, cur);
      }
    }

    const bundleItemRows = await db.select().from(bundleItems);
    const hydratedBundles = allBundles.map((b) => ({
      ...b,
      productIds: bundleItemRows
        .filter((bi) => bi.bundleId === b.id)
        .map((bi) => bi.productId),
    }));

    const settingsMap: Record<string, string> = {};
    for (const s of allSettings) settingsMap[s.key] = s.value;

    const paystack = getPaystackConfig(settingsMap.native_checkout_enabled === 'true');
    const pinterest = getPinterestConfig(settingsMap.pinterest_tag_id);
    const ga = getGoogleAnalyticsConfig(settingsMap.ga_measurement_id);

    const role = req.dbUser!.role;
    const can = (permission: Parameters<typeof hasPermission>[1]) =>
      hasPermission(role, permission);
    const [emailStatus, infrastructure] = await Promise.all([
      can('manage_settings') ? getEmailIntegrationStatus() : Promise.resolve(null),
      can('view_infra') ? gatherInfrastructureReport(settingsMap) : Promise.resolve(null),
    ]);

    const analyticsPayload = {
      productViews,
      outboundSelarClicks,
      freeDownloads,
      protectedDownloadsCount: Number((downloadCounts.rows?.[0] as { total?: number } | undefined)?.total || 0),
      confirmedNativeOrders: paidOrders.length,
      confirmedRevenueNgnKobo,
      confirmedRevenueUsdCents,
      totalOrdersCount: allOrders.length,
      pendingOrdersCount: allOrders.filter((order) => order.paymentStatus === 'pending').length,
      failedOrdersCount: allOrders.filter((order) => order.paymentStatus === 'failed').length,
      refundedOrdersCount: allOrders.filter((order) => order.paymentStatus === 'refunded').length,
      totalCustomers: allUsers.filter((user) => user.role === 'customer').length,
      totalAccounts: allUsers.length,
      newRegistrations7d: allUsers.filter((user) => user.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60_000)).length,
      publishedProducts: allProducts.filter((product) => product.status === 'published').length,
      openSupportCasesCount: allSupportCases.filter((supportCase) => supportCase.status !== 'resolved').length,
      unresolvedIncidentsCount: unresolvedEvents.length,
      trafficSources: Array.from(trafficSources.entries()).map(([source, count]) => ({
        source,
        count,
      })),
      geoDistribution: Array.from(geoCounts.entries()).map(([country, count]) => ({
        country,
        count,
      })),
      perProduct: Array.from(productStats.entries()).map(([slug, stats]) => ({
        slug,
        ...stats,
      })),
    };

    res.json({
      callerRole: role,
      callerPermissions: getPermissionsForRole(role),
      availableRoles: can('manage_roles')
        ? [
            { value: 'customer', label: 'Customer' },
            { value: 'support', label: 'Customer Support' },
            { value: 'finance', label: 'Finance & Transactions' },
            { value: 'ops_monitor', label: 'Read-only Operations Monitor' },
            { value: 'admin', label: 'Administrator' },
          ]
        : [],
      analytics: can('view_reports')
        ? {
            ...analyticsPayload,
            ...(!can('manage_orders')
              ? { confirmedNativeOrders: 0, confirmedRevenueNgnKobo: 0, confirmedRevenueUsdCents: 0 }
              : {}),
            ...(!can('view_orders')
              ? { totalOrdersCount: 0, pendingOrdersCount: 0, failedOrdersCount: 0, refundedOrdersCount: 0 }
              : {}),
            ...(!can('view_customers') ? { totalCustomers: 0, totalAccounts: 0, newRegistrations7d: 0 } : {}),
            ...(!can('manage_catalog') ? { publishedProducts: 0 } : {}),
            ...(!can('manage_support_cases') ? { openSupportCasesCount: 0 } : {}),
            ...(!can('view_infra') ? { unresolvedIncidentsCount: 0 } : {}),
          }
        : {
            ...analyticsPayload,
            confirmedNativeOrders: 0,
            confirmedRevenueNgnKobo: 0,
            confirmedRevenueUsdCents: 0,
            totalOrdersCount: 0,
            pendingOrdersCount: 0,
            failedOrdersCount: 0,
            refundedOrdersCount: 0,
            totalCustomers: 0,
            totalAccounts: 0,
            newRegistrations7d: 0,
            publishedProducts: 0,
            openSupportCasesCount: 0,
            unresolvedIncidentsCount: 0,
            protectedDownloadsCount: 0,
            trafficSources: [],
            geoDistribution: [],
            perProduct: [],
          },
      products: can('manage_catalog') ? allProducts : [],
      categories: can('manage_catalog') ? allCategories : [],
      bundles: can('manage_catalog') ? hydratedBundles : [],
      collections: can('manage_catalog') ? allCollections : [],
      ecosystemPlatforms: can('manage_catalog') ? allPlatforms : [],
      orders: can('view_orders') ? allOrders.map((o) => ({
        ...o,
        items: allOrderItems.filter((oi) => oi.orderId === o.id),
      })) : [],
      customers: can('view_customers')
        ? allUsers.map(({ linkedUids, internalNotes: _notes, ...customer }) => ({
            ...customer,
            internalNotes: null,
            linkedUidsCount: linkedUids?.length || 0,
            orderCount: allOrders.filter((order) => order.userId === customer.id).length,
            paidOrderCount: allOrders.filter(
              (order) => order.userId === customer.id && order.paymentStatus === 'paid'
            ).length,
          }))
        : [],
      subscribers: can('manage_support_cases') ? allSubscribers : [],
      enquiries: can('manage_support_cases') ? allEnquiries : [],
      supportCases: can('manage_support_cases') ? allSupportCases : [],
      recentAccountActivity: can('view_customers') ? recentAccountActivity : [],
      discounts: can('manage_catalog') ? allDiscounts : [],
      settings: can('manage_settings') ? settingsMap : {},
      emailStatus,
      emailLogs: can('manage_settings') ? allEmailLogs : [],
      infrastructure,
      paystackEnvConfigured: paystack.secretKeyConfigured,
      integrationStatus: can('manage_settings') || can('view_infra') ? {
        paystack: {
          secretKeyConfigured: paystack.secretKeyConfigured,
          publicKeyConfigured: paystack.publicKeyConfigured,
          webhookSecretConfigured: paystack.webhookSecretConfigured,
          nativeCheckoutActive: paystack.nativeCheckoutActive,
        },
        pinterest: {
          configured: pinterest.configured,
          source: pinterest.source,
        },
        googleAnalytics: {
          configured: ga.configured,
        },
        downloadSigning: {
          configured: isDownloadSigningSecretConfigured(),
        },
      } : {},
      auditLogs: can('manage_roles') ? recentAudits : [],
    });
  } catch (error) {
    console.error('Error loading admin overview:', error);
    res.status(500).json({ error: 'Unable to load admin overview.' });
  }
});

router.post('/support-cases', requirePermission('manage_support_cases'), async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim().toLowerCase() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!customerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || !subject || description.length < 5) {
      return res.status(400).json({ error: 'Provide a customer name, valid email, subject, and description.' });
    }

    const now = new Date();
    const caseReference = `JNK-SUP-${now.getTime().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [created] = await db.insert(supportCases).values({
      caseReference,
      customerName: customerName.slice(0, 120),
      customerEmail: customerEmail.slice(0, 160),
      category: typeof body.category === 'string' ? body.category.slice(0, 60) : 'general_enquiry',
      subject: subject.slice(0, 180),
      description: description.slice(0, 4000),
      relatedProductSlug: typeof body.relatedProductSlug === 'string' ? body.relatedProductSlug.slice(0, 120) : null,
      transactionReference: typeof body.transactionReference === 'string' ? body.transactionReference.slice(0, 120) : null,
      priority: ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal',
      status: 'open',
      assignedAdminEmail: req.dbUser!.email,
      resolutionHistory: [{
        timestamp: now.toISOString(),
        actorEmail: req.dbUser!.email,
        action: 'CASE_CREATED',
        note: 'Created from the admin support console.',
      }],
    }).returning();

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'CREATE_SUPPORT_CASE',
      targetType: 'support_case',
      targetId: created.id,
      details: `${caseReference}: ${subject.slice(0, 180)}`,
    });
    res.status(201).json({ supportCase: created });
  } catch (error) {
    console.error('Error creating admin support case:', error);
    res.status(500).json({ error: 'Unable to create support case.' });
  }
});

router.patch('/support-cases/:id', requirePermission('manage_support_cases'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid support case ID.' });
    const [current] = await db.select().from(supportCases).where(eq(supportCases.id, id)).limit(1);
    if (!current) return res.status(404).json({ error: 'Support case not found.' });

    const body = req.body || {};
    const allowedStatuses = new Set(['open', 'in_progress', 'resolved', 'escalated']);
    const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);
    if (body.status !== undefined && !allowedStatuses.has(body.status)) return res.status(400).json({ error: 'Invalid case status.' });
    if (body.priority !== undefined && !allowedPriorities.has(body.priority)) return res.status(400).json({ error: 'Invalid case priority.' });
    const now = new Date();
    const changes: string[] = [];
    if (body.status !== undefined && body.status !== current.status) changes.push(`Status: ${current.status} → ${body.status}`);
    if (body.priority !== undefined && body.priority !== current.priority) changes.push(`Priority: ${current.priority} → ${body.priority}`);
    if (body.internalNotes !== undefined && body.internalNotes !== current.internalNotes) changes.push('Internal notes updated.');
    if (body.resolutionSummary !== undefined && body.resolutionSummary !== current.resolutionSummary) changes.push('Resolution summary updated.');

    const history = changes.length ? [...(current.resolutionHistory || []), {
      timestamp: now.toISOString(),
      actorEmail: req.dbUser!.email,
      action: 'CASE_UPDATED',
      note: changes.join(' ').slice(0, 500),
    }] : current.resolutionHistory;
    const [updated] = await db.update(supportCases).set({
      status: body.status ?? current.status,
      priority: body.priority ?? current.priority,
      internalNotes: body.internalNotes === undefined ? current.internalNotes : String(body.internalNotes).slice(0, 4000),
      resolutionSummary: body.resolutionSummary === undefined ? current.resolutionSummary : String(body.resolutionSummary).slice(0, 2000),
      resolvedAt: body.status === 'resolved' ? (current.resolvedAt || now) : body.status ? null : current.resolvedAt,
      assignedAdminEmail: current.assignedAdminEmail || req.dbUser!.email,
      resolutionHistory: history,
      updatedAt: now,
    }).where(eq(supportCases.id, id)).returning();

    if (changes.length) await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_SUPPORT_CASE',
      targetType: 'support_case',
      targetId: id,
      details: `${current.caseReference}: ${changes.join(' ')}`,
    });
    res.json({ supportCase: updated });
  } catch (error) {
    console.error('Error updating admin support case:', error);
    res.status(500).json({ error: 'Unable to update support case.' });
  }
});

router.post('/support-cases/:id/actions', requirePermission('manage_support_cases'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action } = req.body || {};
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 400) : '';
    const allowedActions = new Set([
      'trigger_password_reset',
      'resend_download_notification',
      'reissue_download_link',
      'restore_purchase_access',
      'suspend_customer',
      'reactivate_customer',
    ]);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof action !== 'string' || !allowedActions.has(action)) {
      return res.status(400).json({ error: 'Invalid support case action.' });
    }
    if (reason.length < 3) return res.status(400).json({ error: 'A brief action reason is required.' });
    const [supportCase] = await db.select().from(supportCases).where(eq(supportCases.id, id)).limit(1);
    if (!supportCase) return res.status(404).json({ error: 'Support case not found.' });

    let message = 'Action completed.';
    let downloadUrl: string | undefined;
    if (action === 'trigger_password_reset') {
      const resetLink = await adminAuth.generatePasswordResetLink(supportCase.customerEmail, {
        url: `${(process.env.APP_URL || 'https://digital.jeneconk.com').replace(/\/$/, '')}/account`,
      });
      const sent = await sendTransactionalEmail({
        to: supportCase.customerEmail,
        subject: 'Reset your Jeneconk Digital Store password',
        text: `A password reset was requested by Jeneconk support. Use this single-use link to reset your password: ${resetLink}\nIf you did not request this, ignore this email.`,
        category: 'password_reset_notice',
      });
      if (!sent.sent) return res.status(503).json({ error: 'Password reset email could not be sent; configure transactional email first.' });
      message = `Password reset email sent to ${supportCase.customerEmail}.`;
    } else if (action === 'suspend_customer' || action === 'reactivate_customer') {
      const matches = supportCase.userId
        ? await db.select().from(users).where(eq(users.id, supportCase.userId)).limit(1)
        : await db.select().from(users).where(eq(users.email, supportCase.customerEmail.toLowerCase())).limit(1);
      const target = matches[0];
      if (!target) return res.status(404).json({ error: 'No matching customer account was found.' });
      if (target.role === 'super_admin') return res.status(403).json({ error: 'Super Administrator accounts cannot be changed through support actions.' });
      if (target.role !== 'customer' && req.dbUser!.role !== 'super_admin') return res.status(403).json({ error: 'Only a Super Administrator can change another staff account.' });
      const suspend = action === 'suspend_customer';
      const now = new Date();
      await db.update(users).set({
        accountStatus: suspend ? 'suspended' : 'active',
        suspendedAt: suspend ? now : null,
        suspendedReason: suspend ? reason : null,
        sessionInvalidatedBefore: suspend ? now : target.sessionInvalidatedBefore,
        updatedAt: now,
      }).where(eq(users.id, target.id));
      if (suspend) {
        await Promise.all(Array.from(new Set([target.uid, ...(target.linkedUids || [])])).map(async (uid) => {
          try { await adminAuth.revokeRefreshTokens(uid); } catch { /* Database invalidation remains active. */ }
        }));
      }
      message = suspend ? 'Customer account suspended and prior sessions invalidated.' : 'Customer account reactivated.';
    } else {
      let candidateOrders = supportCase.relatedOrderId
        ? await db.select().from(orders).where(eq(orders.id, supportCase.relatedOrderId)).limit(1)
        : await db.select().from(orders).where(eq(orders.customerEmail, supportCase.customerEmail.toLowerCase())).orderBy(desc(orders.createdAt)).limit(20);
      const paidOrder = candidateOrders.find((order) => order.paymentStatus === 'paid');
      if (!paidOrder) return res.status(404).json({ error: 'No verified paid order was found; purchase access was not changed.' });
      const orderItemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, paidOrder.id));
      const eligibleItems = supportCase.relatedProductSlug
        ? orderItemRows.filter((item) => item.productId !== null)
        : orderItemRows.filter((item) => item.productId !== null);
      let selectedItem = eligibleItems[0];
      let selectedProduct = selectedItem?.productId
        ? (await db.select().from(products).where(eq(products.id, selectedItem.productId)).limit(1))[0]
        : undefined;
      if (supportCase.relatedProductSlug) {
        for (const item of eligibleItems) {
          if (!item.productId) continue;
          const [candidate] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
          if (candidate?.slug === supportCase.relatedProductSlug) {
            selectedItem = item;
            selectedProduct = candidate;
            break;
          }
        }
      }
      if (!selectedItem?.productId || !selectedProduct) return res.status(404).json({ error: 'No downloadable product is attached to the verified order.' });
      const protectedPath = selectedProduct.protectedFilePath
        ? path.resolve(PROTECTED_UPLOAD_DIR, path.basename(selectedProduct.protectedFilePath))
        : null;
      let protectedFileAvailable = false;
      if (protectedPath && protectedPath.startsWith(PROTECTED_UPLOAD_DIR + path.sep)) {
        try { protectedFileAvailable = fs.statSync(protectedPath).isFile(); } catch { protectedFileAvailable = false; }
      }
      if (!protectedFileAvailable) {
        return res.status(404).json({ error: 'The purchased file is not available on this service. No download link was issued.' });
      }

      if (action === 'restore_purchase_access') {
        const target = supportCase.userId
          ? (await db.select().from(users).where(eq(users.id, supportCase.userId)).limit(1))[0]
          : (await db.select().from(users).where(eq(users.email, supportCase.customerEmail.toLowerCase())).limit(1))[0];
        if (!target || !target.emailVerified || target.accountStatus !== 'active') {
          return res.status(400).json({ error: 'Restore requires an active account with a verified matching email.' });
        }
        await db.update(orders).set({ userId: target.id }).where(eq(orders.id, paidOrder.id));
      }

      const targetUser = supportCase.userId
        ? (await db.select().from(users).where(eq(users.id, supportCase.userId)).limit(1))[0]
        : (await db.select().from(users).where(eq(users.email, supportCase.customerEmail.toLowerCase())).limit(1))[0];
      downloadUrl = `/api/downloads/${signDownloadToken({
        productId: selectedItem.productId,
        orderItemId: selectedItem.id,
        userId: targetUser?.id ?? paidOrder.userId,
        email: targetUser?.email ?? paidOrder.customerEmail,
      })}`;

      if (action === 'resend_download_notification') {
        const sent = await sendTransactionalEmail({
          to: supportCase.customerEmail,
          subject: `Your Jeneconk download link: ${selectedProduct.name}`,
          text: `Your verified purchase is ready. Download your ${selectedProduct.name} here: ${(process.env.APP_URL || 'https://digital.jeneconk.com').replace(/\/$/, '')}${downloadUrl}\nThis link expires in 15 minutes. Sign in to your account to request a fresh link.`,
          category: 'purchase_receipt',
        });
        if (!sent.sent) return res.status(503).json({ error: 'Download notification could not be sent; configure transactional email first.' });
        message = `Download notification sent to ${supportCase.customerEmail}.`;
        downloadUrl = undefined;
      } else {
        message = action === 'restore_purchase_access'
          ? 'Verified paid order linked to the customer account. A fresh download link is ready.'
          : 'A fresh download link is ready.';
      }
    }

    const now = new Date();
    await db.update(supportCases).set({
      resolutionHistory: [...(supportCase.resolutionHistory || []), {
        timestamp: now.toISOString(),
        actorEmail: req.dbUser!.email,
        action: String(action).toUpperCase(),
        note: reason,
      }],
      updatedAt: now,
    }).where(eq(supportCases.id, id));
    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: String(action).toUpperCase(),
      targetType: 'support_case',
      targetId: id,
      details: `${supportCase.caseReference}: ${reason}`,
    });
    res.json({ completed: true, message, ...(downloadUrl ? { downloadUrl } : {}) });
  } catch (error) {
    console.error('Support case action failed:', error);
    res.status(500).json({ error: 'Unable to complete support case action.' });
  }
});

router.post('/products', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.slug) {
      return res.status(400).json({ error: 'Product name and slug are required.' });
    }

    const cleanSlug = String(body.slug)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');

    const [created] = await db
      .insert(products)
      .values({
        slug: cleanSlug,
        name: String(body.name).trim(),
        shortBenefit: String(body.shortBenefit || '').trim() || String(body.name).trim(),
        shortDescription: String(body.shortDescription || '').trim() || String(body.name).trim(),
        fullDescription: String(body.fullDescription || '').trim() || String(body.shortDescription || body.name).trim(),
        categoryId: body.categoryId ? Number(body.categoryId) : null,
        coverImage: body.coverImage || null,
        previewImages: Array.isArray(body.previewImages) ? body.previewImages : [],
        fileFormat: String(body.fileFormat || 'PDF').toUpperCase(),
        fileSize: body.fileSize || null,
        version: String(body.version || '1.0'),
        contentsList: Array.isArray(body.contentsList) ? body.contentsList : [],
        keyBenefits: Array.isArray(body.keyBenefits) ? body.keyBenefits : [],
        intendedAudience: Array.isArray(body.intendedAudience) ? body.intendedAudience : [],
        requirements: body.requirements || null,
        instructions: body.instructions || null,
        licenceType: body.licenceType || 'Single Personal Use Licence',
        faqs: Array.isArray(body.faqs) ? body.faqs : [],
        priceNgnKobo:
          body.priceNgnKobo !== null && body.priceNgnKobo !== undefined && body.priceNgnKobo !== ''
            ? Number(body.priceNgnKobo)
            : null,
        originalPriceNgnKobo:
          body.originalPriceNgnKobo ? Number(body.originalPriceNgnKobo) : null,
        priceUsdCents:
          body.priceUsdCents !== null && body.priceUsdCents !== undefined && body.priceUsdCents !== ''
            ? Number(body.priceUsdCents)
            : null,
        originalPriceUsdCents:
          body.originalPriceUsdCents ? Number(body.originalPriceUsdCents) : null,
        isFree: Boolean(body.isFree),
        status: body.status || 'published',
        isFeatured: Boolean(body.isFeatured),
        isBestseller: Boolean(body.isBestseller),
        isNewArrival: body.isNewArrival !== undefined ? Boolean(body.isNewArrival) : true,
        checkoutMode: body.checkoutMode || (body.isFree ? 'free' : 'selar'),
        marketplaceUrl: body.marketplaceUrl ? String(body.marketplaceUrl).trim() : null,
        nativeCheckoutEligible: Boolean(body.nativeCheckoutEligible),
        ecosystemName: body.ecosystemName || null,
        ecosystemUrl: body.ecosystemUrl || null,
        ecosystemPitch: body.ecosystemPitch || null,
        seoTitle: body.seoTitle || null,
        seoDescription: body.seoDescription || null,
        sortOrder:
          body.sortOrder !== undefined && body.sortOrder !== '' ? Number(body.sortOrder) : 0,
        relatedProductIds: Array.isArray(body.relatedProductIds)
          ? body.relatedProductIds.map(Number)
          : [],
      })
      .returning();

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'CREATE_PRODUCT',
      targetType: 'product',
      targetId: created.id,
      details: `Created product ${created.name} (${created.slug})`,
    });

    res.status(201).json({ product: created });
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(400).json({ error: error?.message || 'Unable to create product.' });
  }
});

router.patch('/products/:id', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};

    const updateValues: Partial<typeof products.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateValues.name = String(body.name).trim();
    if (body.slug !== undefined) {
      updateValues.slug = String(body.slug)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    if (body.shortBenefit !== undefined) updateValues.shortBenefit = String(body.shortBenefit);
    if (body.shortDescription !== undefined) updateValues.shortDescription = String(body.shortDescription);
    if (body.fullDescription !== undefined) updateValues.fullDescription = String(body.fullDescription);
    if (body.categoryId !== undefined) updateValues.categoryId = body.categoryId ? Number(body.categoryId) : null;
    if (body.coverImage !== undefined) updateValues.coverImage = body.coverImage || null;
    if (body.previewImages !== undefined) updateValues.previewImages = Array.isArray(body.previewImages) ? body.previewImages : [];
    if (body.fileFormat !== undefined) updateValues.fileFormat = String(body.fileFormat).toUpperCase();
    if (body.fileSize !== undefined) updateValues.fileSize = body.fileSize || null;
    if (body.version !== undefined) updateValues.version = String(body.version);
    if (body.contentsList !== undefined) updateValues.contentsList = Array.isArray(body.contentsList) ? body.contentsList : [];
    if (body.keyBenefits !== undefined) updateValues.keyBenefits = Array.isArray(body.keyBenefits) ? body.keyBenefits : [];
    if (body.intendedAudience !== undefined) updateValues.intendedAudience = Array.isArray(body.intendedAudience) ? body.intendedAudience : [];
    if (body.requirements !== undefined) updateValues.requirements = body.requirements || null;
    if (body.instructions !== undefined) updateValues.instructions = body.instructions || null;
    if (body.licenceType !== undefined) updateValues.licenceType = String(body.licenceType);
    if (body.faqs !== undefined) updateValues.faqs = Array.isArray(body.faqs) ? body.faqs : [];
    if (body.priceNgnKobo !== undefined) {
      updateValues.priceNgnKobo = body.priceNgnKobo === null || body.priceNgnKobo === '' ? null : Number(body.priceNgnKobo);
    }
    if (body.originalPriceNgnKobo !== undefined) {
      updateValues.originalPriceNgnKobo = body.originalPriceNgnKobo === null || body.originalPriceNgnKobo === '' ? null : Number(body.originalPriceNgnKobo);
    }
    if (body.priceUsdCents !== undefined) {
      updateValues.priceUsdCents = body.priceUsdCents === null || body.priceUsdCents === '' ? null : Number(body.priceUsdCents);
    }
    if (body.originalPriceUsdCents !== undefined) {
      updateValues.originalPriceUsdCents = body.originalPriceUsdCents === null || body.originalPriceUsdCents === '' ? null : Number(body.originalPriceUsdCents);
    }
    if (body.isFree !== undefined) updateValues.isFree = Boolean(body.isFree);
    if (body.status !== undefined) updateValues.status = String(body.status);
    if (body.isFeatured !== undefined) updateValues.isFeatured = Boolean(body.isFeatured);
    if (body.isBestseller !== undefined) updateValues.isBestseller = Boolean(body.isBestseller);
    if (body.isNewArrival !== undefined) updateValues.isNewArrival = Boolean(body.isNewArrival);
    if (body.checkoutMode !== undefined) updateValues.checkoutMode = String(body.checkoutMode);
    if (body.marketplaceUrl !== undefined) updateValues.marketplaceUrl = body.marketplaceUrl ? String(body.marketplaceUrl).trim() : null;
    if (body.nativeCheckoutEligible !== undefined) updateValues.nativeCheckoutEligible = Boolean(body.nativeCheckoutEligible);
    if (body.ecosystemName !== undefined) updateValues.ecosystemName = body.ecosystemName || null;
    if (body.ecosystemUrl !== undefined) updateValues.ecosystemUrl = body.ecosystemUrl || null;
    if (body.ecosystemPitch !== undefined) updateValues.ecosystemPitch = body.ecosystemPitch || null;
    if (body.seoTitle !== undefined) updateValues.seoTitle = body.seoTitle || null;
    if (body.seoDescription !== undefined) updateValues.seoDescription = body.seoDescription || null;
    if (body.sortOrder !== undefined) updateValues.sortOrder = Number(body.sortOrder || 0);
    if (body.relatedProductIds !== undefined) {
      updateValues.relatedProductIds = Array.isArray(body.relatedProductIds)
        ? body.relatedProductIds.map(Number)
        : [];
    }

    const [updated] = await db
      .update(products)
      .set(updateValues)
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_PRODUCT',
      targetType: 'product',
      targetId: id,
      details: `Updated product ${updated.name}`,
    });

    res.json({ product: updated });
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(400).json({ error: error?.message || 'Unable to update product.' });
  }
});

router.delete('/products/:id', requirePermission('manage_catalog'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'DELETE_PRODUCT',
      targetType: 'product',
      targetId: id,
      details: `Deleted product ${deleted.name}`,
    });

    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Unable to delete product.' });
  }
});

router.post('/upload/image', requirePermission('manage_catalog'), imageUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }
    const url = `/uploads/${req.file.filename}`;
    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPLOAD_IMAGE',
      targetType: 'media',
      details: url,
    });
    res.json({ url, size: req.file.size });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Image upload failed.' });
  }
});

router.post(
  '/upload/product-file/:productId',
  requirePermission('manage_catalog'),
  productFileUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const productId = Number(req.params.productId);
      if (!req.file) {
        return res.status(400).json({ error: 'No digital product file provided.' });
      }
      const sizeMb = (req.file.size / (1024 * 1024)).toFixed(2);
      const sizeLabel = req.file.size >= 1024 * 1024 ? `${sizeMb} MB` : `${Math.ceil(req.file.size / 1024)} KB`;

      const [updated] = await db
        .update(products)
        .set({
          protectedFilePath: req.file.filename,
          fileSize: sizeLabel,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Product not found.' });
      }

      await recordAuditLog({
        adminUid: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        action: 'UPLOAD_PROTECTED_FILE',
        targetType: 'product',
        targetId: productId,
        details: `Uploaded protected asset (${sizeLabel}) for ${updated.name}`,
      });

      res.json({ product: updated });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Protected file upload failed.' });
    }
  }
);

router.post('/categories', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const slug = String(body.slug || body.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');
    const [created] = await db
      .insert(categories)
      .values({
        slug,
        name: String(body.name).trim(),
        description: String(body.description || '').trim(),
        subtopics: Array.isArray(body.subtopics) ? body.subtopics : [],
        imageUrl: body.imageUrl || null,
        ecosystemApp: body.ecosystemApp || null,
        ecosystemUrl: body.ecosystemUrl || null,
        sortOrder: Number(body.sortOrder || 0),
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      })
      .returning();

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'CREATE_CATEGORY',
      targetType: 'category',
      targetId: created.id,
      details: created.name,
    });

    res.status(201).json({ category: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to create category.' });
  }
});

router.patch('/categories/:id', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const [updated] = await db
      .update(categories)
      .set({
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        description: body.description !== undefined ? String(body.description).trim() : undefined,
        subtopics: Array.isArray(body.subtopics) ? body.subtopics : undefined,
        imageUrl: body.imageUrl !== undefined ? body.imageUrl || null : undefined,
        ecosystemApp: body.ecosystemApp !== undefined ? body.ecosystemApp || null : undefined,
        ecosystemUrl: body.ecosystemUrl !== undefined ? body.ecosystemUrl || null : undefined,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      })
      .where(eq(categories.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Category not found.' });

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_CATEGORY',
      targetType: 'category',
      targetId: id,
      details: updated.name,
    });

    res.json({ category: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to update category.' });
  }
});

router.post('/bundles', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const slug = String(body.slug || body.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');

    const [created] = await db
      .insert(bundles)
      .values({
        slug,
        name: String(body.name).trim(),
        description: String(body.description || '').trim(),
        coverImage: body.coverImage || null,
        priceNgnKobo: body.priceNgnKobo ? Number(body.priceNgnKobo) : null,
        priceUsdCents: body.priceUsdCents ? Number(body.priceUsdCents) : null,
        marketplaceUrl: body.marketplaceUrl || null,
        checkoutMode: body.checkoutMode || 'selar',
        status: body.status || 'published',
        isFeatured: Boolean(body.isFeatured),
      })
      .returning();

    if (Array.isArray(body.productIds) && body.productIds.length > 0) {
      await db.insert(bundleItems).values(
        body.productIds.map((pid: number) => ({
          bundleId: created.id,
          productId: Number(pid),
        }))
      );
    }

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'CREATE_BUNDLE',
      targetType: 'bundle',
      targetId: created.id,
      details: created.name,
    });

    res.status(201).json({ bundle: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to create bundle.' });
  }
});

router.patch('/bundles/:id', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const updateValues: Partial<typeof bundles.$inferInsert> = {};

    if (body.name !== undefined) updateValues.name = String(body.name).trim();
    if (body.slug !== undefined && String(body.slug).trim()) {
      updateValues.slug = String(body.slug)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    if (body.description !== undefined) {
      updateValues.description = String(body.description).trim();
    }
    if (body.coverImage !== undefined) updateValues.coverImage = body.coverImage || null;
    if (body.priceNgnKobo !== undefined) {
      updateValues.priceNgnKobo =
        body.priceNgnKobo === null || body.priceNgnKobo === ''
          ? null
          : Number(body.priceNgnKobo);
    }
    if (body.priceUsdCents !== undefined) {
      updateValues.priceUsdCents =
        body.priceUsdCents === null || body.priceUsdCents === ''
          ? null
          : Number(body.priceUsdCents);
    }
    if (body.marketplaceUrl !== undefined) {
      updateValues.marketplaceUrl = body.marketplaceUrl
        ? String(body.marketplaceUrl).trim()
        : null;
    }
    if (body.status !== undefined) updateValues.status = String(body.status);
    if (body.isFeatured !== undefined) updateValues.isFeatured = Boolean(body.isFeatured);

    const [updated] = await db
      .update(bundles)
      .set(updateValues)
      .where(eq(bundles.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Bundle not found.' });
    }

    if (Array.isArray(body.productIds)) {
      await db.delete(bundleItems).where(eq(bundleItems.bundleId, id));
      if (body.productIds.length > 0) {
        await db.insert(bundleItems).values(
          body.productIds.map((pid: number) => ({
            bundleId: id,
            productId: Number(pid),
          }))
        );
      }
    }

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_BUNDLE',
      targetType: 'bundle',
      targetId: id,
      details: updated.name,
    });

    res.json({ bundle: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to update bundle.' });
  }
});

router.delete('/bundles/:id', requirePermission('manage_catalog'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(bundles).where(eq(bundles.id, id));
    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'DELETE_BUNDLE',
      targetType: 'bundle',
      targetId: id,
    });
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: 'Unable to delete bundle.' });
  }
});

router.patch('/collections/:id', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { title, subtitle, productIds, isActive } = req.body || {};
    const [updated] = await db
      .update(collections)
      .set({
        title: title !== undefined ? String(title).trim() : undefined,
        subtitle: subtitle !== undefined ? String(subtitle).trim() : undefined,
        productIds: Array.isArray(productIds) ? productIds.map(Number) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      })
      .where(eq(collections.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Collection not found.' });

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_COLLECTION',
      targetType: 'collection',
      targetId: id,
      details: updated.title,
    });

    res.json({ collection: updated });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update collection.' });
  }
});

router.post('/discounts', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const { code, discountType, value, maxUses } = req.body || {};
    const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    const cleanType = discountType || 'percent';
    const numericValue = Number(value);
    const numericMaxUses = maxUses === '' || maxUses === null || maxUses === undefined
      ? null
      : Number(maxUses);
    if (!/^[A-Z0-9_-]{3,32}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Discount code must be 3–32 letters, numbers, hyphens, or underscores.' });
    }
    if (!['percent', 'fixed_ngn', 'fixed_usd'].includes(cleanType)) {
      return res.status(400).json({ error: 'Unsupported discount type.' });
    }
    if (!Number.isSafeInteger(numericValue) || numericValue <= 0 || (cleanType === 'percent' && numericValue > 100)) {
      return res.status(400).json({ error: 'Discount value must be a positive integer; percentage discounts cannot exceed 100.' });
    }
    if (numericMaxUses !== null && (!Number.isSafeInteger(numericMaxUses) || numericMaxUses <= 0)) {
      return res.status(400).json({ error: 'Maximum uses must be a positive integer.' });
    }
    const [created] = await db
      .insert(discountCodes)
      .values({
        code: cleanCode,
        discountType: cleanType,
        value: numericValue,
        maxUses: numericMaxUses,
        isActive: true,
      })
      .returning();

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'CREATE_DISCOUNT',
      targetType: 'discount',
      targetId: created.id,
      details: `${created.code} (${created.discountType}: ${created.value})`,
    });

    res.status(201).json({ discount: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to create discount code.' });
  }
});

router.patch('/discounts/:id', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body || {};
    const [updated] = await db
      .update(discountCodes)
      .set({ isActive: Boolean(isActive) })
      .where(eq(discountCodes.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Discount code not found.' });

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_DISCOUNT',
      targetType: 'discount',
      targetId: id,
      details: `${updated.code} set to ${updated.isActive ? 'Active' : 'Paused'}`,
    });

    res.json({ discount: updated });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update discount.' });
  }
});

router.patch('/enquiries/:id', requirePermission('manage_support_cases'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const [updated] = await db
      .update(supportEnquiries)
      .set({ status: String(status) })
      .where(eq(supportEnquiries.id, id))
      .returning();

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_ENQUIRY',
      targetType: 'support_enquiry',
      targetId: id,
      details: `Status set to ${status}`,
    });

    res.json({ enquiry: updated });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update enquiry status.' });
  }
});

router.post('/orders/:id/refund', requirePermission('manage_orders'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid order ID.' });
    if (reason.length < 3) return res.status(400).json({ error: 'A refund reference or audit reason is required.' });
    const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!current) return res.status(404).json({ error: 'Order not found.' });
    if (current.paymentStatus === 'refunded') return res.json({ order: current, alreadyRefunded: true });
    if (current.paymentStatus !== 'paid') return res.status(409).json({ error: 'Only a verified paid order can be recorded as refunded.' });
    const [updated] = await db
      .update(orders)
      .set({ paymentStatus: 'refunded' })
      .where(and(eq(orders.id, id), eq(orders.paymentStatus, 'paid')))
      .returning();

    if (!updated) return res.status(409).json({ error: 'Order state changed; no refund status was recorded.' });

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'REFUND_ORDER',
      targetType: 'order',
      targetId: id,
      details: `Recorded refund for order ${updated.orderReference}. Reason/reference: ${reason.slice(0, 300)}`,
    });

    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Unable to record refund.' });
  }
});

router.get('/orders/export', requirePermission('export_reports'), async (_req: AuthRequest, res) => {
  try {
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
    const header =
      'order_reference,customer_email,customer_name,currency,total_minor,payment_status,created_at\n';
    const rows = allOrders
      .map(
        (o) =>
          `"${o.orderReference}","${o.customerEmail}","${(o.customerName || '').replace(/"/g, '""')}","${o.currency}",${o.totalMinor},"${o.paymentStatus}","${o.createdAt.toISOString()}"`
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="jeneconk-orders.csv"');
    res.send(header + rows);
  } catch (error) {
    res.status(500).json({ error: 'Unable to export orders.' });
  }
});

router.post('/orders/:id/verify-paystack', requirePermission('manage_orders'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid order ID.' });
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus === 'paid') return res.json({ verified: true, paystackStatus: 'success', alreadyVerified: true });
    if (!order.paystackReference || order.paymentProvider !== 'paystack') {
      return res.status(400).json({ error: 'This order has no Paystack reference to verify.' });
    }
    const toggleRows = await db.select().from(storeSettings).where(eq(storeSettings.key, 'native_checkout_enabled')).limit(1);
    const paystack = getPaystackConfig(toggleRows[0]?.value === 'true');
    if (!paystack.nativeCheckoutActive) return res.status(503).json({ error: 'Paystack verification is not configured or enabled.' });
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(order.paystackReference)}`, {
      headers: { Authorization: `Bearer ${paystack.secretKey}` },
    });
    const result = await response.json() as { status?: boolean; message?: string; data?: { status?: string; amount?: number; currency?: string } };
    if (!response.ok || !result.status || !result.data) {
      return res.status(502).json({ error: result.message || 'Paystack verification request failed.' });
    }
    if (result.data.status !== 'success') {
      return res.json({ verified: false, paystackStatus: result.data.status || 'unknown' });
    }
    const fulfilled = await fulfillVerifiedOrder(order.paystackReference, result.data.amount || 0, result.data.currency || '');
    if (!fulfilled) return res.status(404).json({ error: 'Paystack reference does not match an order.' });
    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'VERIFY_PAYSTACK_ORDER',
      targetType: 'order',
      targetId: id,
      details: `Paystack verified ${order.orderReference} (${result.data.currency} ${result.data.amount}).`,
    });
    res.json({ verified: true, paystackStatus: 'success', order: fulfilled.order });
  } catch (error) {
    console.error('Admin Paystack verification failed:', error);
    res.status(500).json({ error: 'Unable to verify this order with Paystack.' });
  }
});

router.post('/orders/:id/reassign', requirePermission('reassign_orders'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const targetEmail = typeof req.body?.targetEmail === 'string' ? req.body.targetEmail.trim().toLowerCase() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || reason.length < 3) {
      return res.status(400).json({ error: 'Provide a valid target email and an audit reason.' });
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus !== 'paid') return res.status(403).json({ error: 'Only verified paid orders can be reassigned.' });
    const targets = await db.select().from(users).where(eq(users.email, targetEmail)).limit(2);
    if (targets.length !== 1 || !targets[0].emailVerified || targets[0].accountStatus !== 'active') {
      return res.status(400).json({ error: 'Target must be one active account with a verified matching email.' });
    }
    const [updated] = await db.update(orders).set({ userId: targets[0].id }).where(eq(orders.id, id)).returning();
    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'REASSIGN_ORDER',
      targetType: 'order',
      targetId: id,
      details: `${order.orderReference} reassigned to ${targetEmail}. Reason: ${reason.slice(0, 300)}`,
    });
    res.json({ order: updated });
  } catch (error) {
    console.error('Order reassignment failed:', error);
    res.status(500).json({ error: 'Unable to reassign order.' });
  }
});

router.get('/customers/:id', requirePermission('view_customers'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid customer ID.' });
    const [customer] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const [customerOrders, downloads, cases, activityTimeline] = await Promise.all([
      db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.createdAt)),
      db.select().from(downloadLogs).where(eq(downloadLogs.userId, id)).orderBy(desc(downloadLogs.downloadedAt)).limit(100),
      db.select().from(supportCases).where(eq(supportCases.userId, id)).orderBy(desc(supportCases.updatedAt)),
      db.select().from(accountEvents).where(eq(accountEvents.userId, id)).orderBy(desc(accountEvents.createdAt)).limit(100),
    ]);
    const { linkedUids, internalNotes, ...safeCustomer } = customer;
    res.json({
      customer: {
        ...safeCustomer,
        ...(hasPermission(req.dbUser!.role, 'manage_customers_support') ? { internalNotes } : {}),
        linkedUidsCount: linkedUids?.length || 0,
        orderCount: customerOrders.length,
        paidOrderCount: customerOrders.filter((order) => order.paymentStatus === 'paid').length,
      },
      orders: customerOrders,
      downloads,
      supportCases: cases,
      activityTimeline,
    });
  } catch (error) {
    console.error('Error loading admin customer details:', error);
    res.status(500).json({ error: 'Unable to load customer profile.' });
  }
});

router.patch('/customers/:id/status', requirePermission('manage_customers_support'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { accountStatus, reason } = req.body || {};
    if (!Number.isSafeInteger(id) || id <= 0 || !['active', 'suspended'].includes(accountStatus)) {
      return res.status(400).json({ error: 'Invalid account status.' });
    }
    if (accountStatus === 'suspended' && (typeof reason !== 'string' || reason.trim().length < 3)) {
      return res.status(400).json({ error: 'A suspension reason is required.' });
    }
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Customer not found.' });
    if (target.role === 'super_admin') return res.status(403).json({ error: 'Super Administrator accounts cannot be suspended here.' });
    if (target.role !== 'customer' && req.dbUser!.role !== 'super_admin') return res.status(403).json({ error: 'Only a Super Administrator can change another staff account status.' });

    const now = new Date();
    const [updated] = await db.update(users).set({
      accountStatus,
      suspendedAt: accountStatus === 'suspended' ? now : null,
      suspendedReason: accountStatus === 'suspended' ? reason.trim().slice(0, 500) : null,
      sessionInvalidatedBefore: accountStatus === 'suspended' ? now : target.sessionInvalidatedBefore,
      updatedAt: now,
    }).where(eq(users.id, id)).returning();
    if (accountStatus === 'suspended') {
      await Promise.all((target.linkedUids?.length ? target.linkedUids : [target.uid]).map(async (uid) => {
        try { await adminAuth.revokeRefreshTokens(uid); } catch { /* DB invalidation remains authoritative */ }
      }));
    }
    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: accountStatus === 'suspended' ? 'SUSPEND_CUSTOMER' : 'REACTIVATE_CUSTOMER',
      targetType: 'user',
      targetId: id,
      details: `${target.email}: ${reason || 'Reactivated by support operations'}`,
    });
    const { linkedUids: _uids, internalNotes: _notes, ...safeUpdated } = updated;
    res.json({ customer: { ...safeUpdated, linkedUidsCount: target.linkedUids?.length || 0 } });
  } catch (error) {
    console.error('Error updating customer status:', error);
    res.status(500).json({ error: 'Unable to update customer status.' });
  }
});

router.patch('/customers/:id/notes', requirePermission('manage_customers_support'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { internalNotes } = req.body || {};
    if (!Number.isSafeInteger(id) || id <= 0 || typeof internalNotes !== 'string') {
      return res.status(400).json({ error: 'Invalid customer notes.' });
    }
    const [updated] = await db.update(users).set({ internalNotes: internalNotes.slice(0, 5000), updatedAt: new Date() })
      .where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ error: 'Customer not found.' });
    await recordAuditLog({ adminUid: req.dbUser!.uid, adminEmail: req.dbUser!.email, action: 'UPDATE_CUSTOMER_NOTES', targetType: 'user', targetId: id });
    const { linkedUids: _uids, ...safeUpdated } = updated;
    res.json({ customer: { ...safeUpdated, linkedUidsCount: updated.linkedUids?.length || 0 } });
  } catch (error) {
    console.error('Error updating customer notes:', error);
    res.status(500).json({ error: 'Unable to save customer notes.' });
  }
});

router.post('/customers/:id/trigger-password-reset', requirePermission('manage_customers_support'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid customer ID.' });
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Customer not found.' });
    if (target.role !== 'customer' && req.dbUser!.role !== 'super_admin') return res.status(403).json({ error: 'Only a Super Administrator can trigger password reset for a staff account.' });
    const resetLink = await adminAuth.generatePasswordResetLink(target.email, {
      url: `${(process.env.APP_URL || 'https://digital.jeneconk.com').replace(/\/$/, '')}/account`,
    });
    const email = await sendTransactionalEmail({
      to: target.email,
      subject: 'Reset your Jeneconk Digital Store password',
      text: `A password reset was requested by Jeneconk support. Use this single-use link to reset your password: ${resetLink}\nIf you did not request this, you can ignore this email.`,
      category: 'password_reset_notice',
    });
    if (!email.sent) return res.status(503).json({ error: 'Password reset email could not be sent because transactional email is not configured.' });
    await recordAuditLog({ adminUid: req.dbUser!.uid, adminEmail: req.dbUser!.email, action: 'TRIGGER_PASSWORD_RESET', targetType: 'user', targetId: id, details: `${target.email}; ${req.body?.reason || 'Support request'}` });
    res.json({ sent: true, message: `Password reset email sent to ${target.email}.` });
  } catch (error) {
    console.error('Error triggering password reset:', error);
    res.status(503).json({ error: 'Unable to generate or send password reset email.' });
  }
});

router.post('/customers/:id/revoke-sessions', requirePermission('manage_customers_support'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid customer ID.' });
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Customer not found.' });
    if (target.role !== 'customer' && req.dbUser!.role !== 'super_admin') return res.status(403).json({ error: 'Only a Super Administrator can revoke sessions for a staff account.' });
    const now = new Date();
    await db.update(users).set({ sessionInvalidatedBefore: now, updatedAt: now }).where(eq(users.id, id));
    const uids = Array.from(new Set([target.uid, ...(target.linkedUids || [])]));
    await Promise.all(uids.map(async (uid) => {
      try { await adminAuth.revokeRefreshTokens(uid); } catch { /* DB invalidation remains authoritative */ }
    }));
    await recordAuditLog({ adminUid: req.dbUser!.uid, adminEmail: req.dbUser!.email, action: 'REVOKE_CUSTOMER_SESSIONS', targetType: 'user', targetId: id, details: `${target.email}; ${String(req.body?.reason || 'Security action').slice(0, 240)}` });
    res.json({ revoked: true, message: 'Customer sessions have been invalidated.' });
  } catch (error) {
    console.error('Error revoking customer sessions:', error);
    res.status(500).json({ error: 'Unable to invalidate customer sessions.' });
  }
});

router.patch('/customers/:id/role', requirePermission('manage_roles'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { role, reason } = req.body || {};
    const allowedRoles = new Set(['customer', 'support', 'finance', 'ops_monitor', 'admin']);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof role !== 'string' || !allowedRoles.has(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    if (id === req.dbUser!.id) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'A short audit reason is required.' });
    }
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Customer not found.' });
    if (target.role === 'super_admin') {
      return res.status(403).json({ error: 'Super Administrator roles cannot be changed here.' });
    }
    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'CHANGE_USER_ROLE',
      targetType: 'user',
      targetId: id,
      details: `${updated.email} role changed from ${target.role} to ${role}. Reason: ${reason.trim().slice(0, 240)}`,
    });

    res.json({ customer: updated });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update user role.' });
  }
});

router.post('/ecosystem', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.name) {
      return res.status(400).json({ error: 'Platform name is required.' });
    }
    const slug = String(body.slug || body.name)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');

    const [created] = await db
      .insert(ecosystemPlatforms)
      .values({
        slug,
        name: String(body.name).trim(),
        category: String(body.category || 'Education & Learning').trim(),
        relatedCategorySlug: body.relatedCategorySlug ? String(body.relatedCategorySlug).trim() : null,
        description: String(body.description || '').trim(),
        destinationUrl: body.destinationUrl ? String(body.destinationUrl).trim() : null,
        iconName: String(body.iconName || 'Layers').trim(),
        logoUrl: body.logoUrl ? String(body.logoUrl).trim() : null,
        status: String(body.status || 'published'),
        isFeatured: body.isFeatured !== undefined ? Boolean(body.isFeatured) : true,
        sortOrder: Number(body.sortOrder || 0),
      })
      .returning();

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'CREATE_ECOSYSTEM_PLATFORM',
      targetType: 'ecosystem_platform',
      targetId: created.id,
      details: created.name,
    });

    res.status(201).json({ platform: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to create ecosystem platform.' });
  }
});

router.patch('/ecosystem/:id', requirePermission('manage_catalog'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const updateValues: Partial<typeof ecosystemPlatforms.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateValues.name = String(body.name).trim();
    if (body.slug !== undefined && String(body.slug).trim()) {
      updateValues.slug = String(body.slug)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    if (body.category !== undefined) updateValues.category = String(body.category).trim();
    if (body.relatedCategorySlug !== undefined) {
      updateValues.relatedCategorySlug = body.relatedCategorySlug
        ? String(body.relatedCategorySlug).trim()
        : null;
    }
    if (body.description !== undefined) updateValues.description = String(body.description).trim();
    if (body.destinationUrl !== undefined) {
      updateValues.destinationUrl = body.destinationUrl
        ? String(body.destinationUrl).trim()
        : null;
    }
    if (body.iconName !== undefined) updateValues.iconName = String(body.iconName).trim() || 'Layers';
    if (body.logoUrl !== undefined) updateValues.logoUrl = body.logoUrl ? String(body.logoUrl).trim() : null;
    if (body.status !== undefined) updateValues.status = String(body.status);
    if (body.isFeatured !== undefined) updateValues.isFeatured = Boolean(body.isFeatured);
    if (body.sortOrder !== undefined) updateValues.sortOrder = Number(body.sortOrder || 0);

    const [updated] = await db
      .update(ecosystemPlatforms)
      .set(updateValues)
      .where(eq(ecosystemPlatforms.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Ecosystem platform not found.' });

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_ECOSYSTEM_PLATFORM',
      targetType: 'ecosystem_platform',
      targetId: id,
      details: updated.name,
    });

    res.json({ platform: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to update ecosystem platform.' });
  }
});

router.delete('/ecosystem/:id', requirePermission('manage_catalog'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(ecosystemPlatforms)
      .where(eq(ecosystemPlatforms.id, id))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Ecosystem platform not found.' });

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'DELETE_ECOSYSTEM_PLATFORM',
      targetType: 'ecosystem_platform',
      targetId: id,
      details: deleted.name,
    });

    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: 'Unable to delete ecosystem platform.' });
  }
});

router.post('/infrastructure/health-check', requirePermission('view_infra'), async (_req: AuthRequest, res) => {
  try {
    const settingRows = await db.select().from(storeSettings);
    const settingsMap = Object.fromEntries(settingRows.map((row) => [row.key, row.value]));
    const report = await gatherInfrastructureReport(settingsMap);
    res.json({ completed: true, report });
  } catch (error) {
    console.error('Infrastructure health check failed:', error);
    res.status(500).json({ error: 'Infrastructure health check failed.' });
  }
});

router.post('/infrastructure/maintenance-check', requirePermission('run_safe_ops'), async (_req: AuthRequest, res) => {
  try {
    const settingRows = await db.select().from(storeSettings);
    const settingsMap = Object.fromEntries(settingRows.map((row) => [row.key, row.value]));
    const report = await gatherInfrastructureReport(settingsMap);
    const issues = report.components
      .filter((component) => ['degraded', 'partial', 'not_configured'].includes(component.status))
      .map((component) => ({ component: component.name, status: component.status, action: component.recommendedAction }));
    res.json({ diagnostics: { checkedAt: report.checkedAt, issues, changesMade: false } });
  } catch (error) {
    console.error('Safe maintenance check failed:', error);
    res.status(500).json({ error: 'Safe maintenance diagnostics failed.' });
  }
});

router.post('/infrastructure/retry-notifications', requirePermission('run_safe_ops'), async (_req: AuthRequest, res) => {
  // Email logs intentionally store delivery metadata, not original message bodies; replay is not safe or possible.
  res.status(409).json({ error: 'Notification retry is unavailable because original email content is not retained. Resend from the related support or order record instead.' });
});

router.patch('/infrastructure/events/:id/resolve', requirePermission('run_safe_ops'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid incident ID.' });
    const [updated] = await db.update(systemEvents).set({ resolved: true }).where(eq(systemEvents.id, id)).returning();
    if (!updated) return res.status(404).json({ error: 'Incident not found.' });
    await recordAuditLog({ adminUid: req.dbUser!.uid, adminEmail: req.dbUser!.email, action: 'RESOLVE_SYSTEM_EVENT', targetType: 'system_event', targetId: id, details: updated.message });
    res.json({ resolved: true, event: updated });
  } catch (error) {
    console.error('Could not resolve system event:', error);
    res.status(500).json({ error: 'Unable to resolve incident.' });
  }
});

router.post('/email/test', adminEmailTestLimiter, requirePermission('manage_settings'), async (req: AuthRequest, res) => {
  try {
    const { to, fromIdentity = 'support' } = req.body || {};
    if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      return res.status(400).json({ error: 'Enter a valid recipient email address.' });
    }
    if (!['support', 'business'].includes(fromIdentity)) return res.status(400).json({ error: 'Invalid sender identity.' });
    const result = await sendTransactionalEmail({
      to: to.trim().toLowerCase(),
      subject: 'Jeneconk Digital Store email delivery test',
      text: 'This test confirms that the Jeneconk Digital Store transactional email service can deliver messages.',
      category: 'test_email',
      fromIdentity,
    });
    if (!result.sent) return res.status(503).json({ error: result.errorMessage || 'Transactional email is not configured.' });
    await recordAuditLog({ adminUid: req.dbUser!.uid, adminEmail: req.dbUser!.email, action: 'SEND_TEST_EMAIL', targetType: 'email', details: `Test email sent to ${to.trim().toLowerCase()} via ${result.provider}.` });
    res.json({ sent: true, to: to.trim().toLowerCase(), provider: result.provider });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ error: 'Unable to send test email.' });
  }
});

router.get('/reports/export', requirePermission('export_reports'), async (req: AuthRequest, res) => {
  try {
    const type = String(req.query.type || '');
    const fromRaw = typeof req.query.from === 'string' ? req.query.from : '';
    const toRaw = typeof req.query.to === 'string' ? req.query.to : '';
    const productSlug = typeof req.query.productSlug === 'string' ? req.query.productSlug.trim() : '';
    const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : null;
    const to = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return res.status(400).json({ error: 'Invalid date filter.' });
    const inRange = (date: Date) => (!from || date >= from) && (!to || date <= to);
    const csvCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\t\r =+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    let output: string;

    if (type === 'orders') {
      if (!hasPermission(req.dbUser!.role, 'manage_orders')) return res.status(403).json({ error: 'Your role cannot export order data.' });
      const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
      const filtered = rows.filter((row) => inRange(row.createdAt));
      const withItems = await db.select().from(orderItems);
      const matchingProductIds = productSlug
        ? new Set((await db.select({ id: products.id }).from(products).where(eq(products.slug, productSlug))).map((product) => product.id))
        : null;
      output = csv(['orderReference', 'customerEmail', 'currency', 'totalMinor', 'paymentStatus', 'items', 'createdAt'], filtered.filter((row) => !matchingProductIds || withItems.some((item) => item.orderId === row.id && item.productId !== null && matchingProductIds.has(item.productId))).map((row) => [row.orderReference, row.customerEmail, row.currency, row.totalMinor, row.paymentStatus, withItems.filter((item) => item.orderId === row.id && (!matchingProductIds || (item.productId !== null && matchingProductIds.has(item.productId)))).map((item) => item.productName).join('; '), row.createdAt.toISOString()]));
    } else if (type === 'customers') {
      if (!hasPermission(req.dbUser!.role, 'view_customers')) return res.status(403).json({ error: 'Your role cannot export customer data.' });
      const rows = await db.select().from(users).orderBy(desc(users.createdAt));
      output = csv(['email', 'fullName', 'role', 'accountStatus', 'emailVerified', 'createdAt', 'lastLoginAt'], rows.filter((row) => inRange(row.createdAt)).map((row) => [row.email, row.fullName, row.role, row.accountStatus, row.emailVerified, row.createdAt.toISOString(), row.lastLoginAt?.toISOString()]));
    } else if (type === 'downloads') {
      if (!hasPermission(req.dbUser!.role, 'view_orders')) return res.status(403).json({ error: 'Your role cannot export download records.' });
      const logs = await db.select().from(downloadLogs).orderBy(desc(downloadLogs.downloadedAt));
      const productRows = await db.select().from(products);
      output = csv(['downloadedAt', 'productSlug', 'email', 'orderItemId', 'ipAddress'], logs.filter((row) => inRange(row.downloadedAt) && (!productSlug || productRows.find((p) => p.id === row.productId)?.slug === productSlug)).map((row) => [row.downloadedAt.toISOString(), productRows.find((p) => p.id === row.productId)?.slug, row.email, row.orderItemId, row.ipAddress]));
    } else if (type === 'support_cases') {
      if (!hasPermission(req.dbUser!.role, 'manage_support_cases')) return res.status(403).json({ error: 'Your role cannot export support case data.' });
      const rows = await db.select().from(supportCases).orderBy(desc(supportCases.createdAt));
      output = csv(['caseReference', 'customerEmail', 'category', 'subject', 'status', 'priority', 'createdAt'], rows.filter((row) => inRange(row.createdAt) && (!productSlug || row.relatedProductSlug === productSlug)).map((row) => [row.caseReference, row.customerEmail, row.category, row.subject, row.status, row.priority, row.createdAt.toISOString()]));
    } else if (type === 'system_events') {
      if (!hasPermission(req.dbUser!.role, 'view_infra')) return res.status(403).json({ error: 'Your role cannot export system events.' });
      const rows = await db.select().from(systemEvents).orderBy(desc(systemEvents.createdAt));
      output = csv(['createdAt', 'component', 'severity', 'eventType', 'message', 'resolved'], rows.filter((row) => inRange(row.createdAt)).map((row) => [row.createdAt.toISOString(), row.component, row.severity, row.eventType, row.message, row.resolved]));
    } else {
      return res.status(400).json({ error: 'Unsupported report type.' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jeneconk-${type}-report.csv"`);
    res.send(output);
  } catch (error) {
    console.error('Report export failed:', error);
    res.status(500).json({ error: 'Unable to export report.' });
  }
});

router.patch('/settings', requirePermission('manage_settings'), requireRecentReauth(), async (req: AuthRequest, res) => {
  try {
    const updates = req.body || {};
    const allowedKeys = new Set([
      'native_checkout_enabled',
      'promo_banner_enabled',
      'promo_banner_text',
      'hero_kicker',
      'free_promo_headline',
      'free_promo_subtext',
      'support_email',
      'whatsapp_number',
      'pinterest_tag_id',
      'ga_measurement_id',
    ]);

    for (const [key, val] of Object.entries(updates)) {
      if (!allowedKeys.has(key)) continue;
      const strVal = String(val ?? '');
      await db
        .insert(storeSettings)
        .values({ key, value: strVal, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: storeSettings.key,
          set: { value: sql`excluded.value`, updatedAt: new Date() },
        });
    }

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'UPDATE_SETTINGS',
      targetType: 'store_settings',
      details: Object.keys(updates).filter((k) => allowedKeys.has(k)).join(', '),
    });

    const rows = await db.select().from(storeSettings);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({ settings: map });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update store settings.' });
  }
});

export default router;
