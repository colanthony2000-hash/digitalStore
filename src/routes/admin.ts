import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Router } from 'express';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  analyticsEvents,
  auditLogs,
  bundleItems,
  bundles,
  categories,
  collections,
  discountCodes,
  ecosystemPlatforms,
  newsletterSubscribers,
  orderItems,
  orders,
  products,
  storeSettings,
  supportEnquiries,
  users,
} from '../db/schema.ts';
import { requireAdmin, type AuthRequest } from '../middleware/auth.ts';
import {
  createRateLimiter,
  isDownloadSigningSecretConfigured,
  recordAuditLog,
} from '../lib/security.ts';
import {
  getGoogleAnalyticsConfig,
  getPaystackConfig,
  getPinterestConfig,
} from '../lib/integrations.ts';

const router = Router();
const adminLimiter = createRateLimiter(120, 60_000);

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

router.get('/overview', async (_req: AuthRequest, res) => {
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

    res.json({
      analytics: {
        productViews,
        outboundSelarClicks,
        freeDownloads,
        confirmedNativeOrders: paidOrders.length,
        confirmedRevenueNgnKobo,
        confirmedRevenueUsdCents,
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
      },
      products: allProducts,
      categories: allCategories,
      bundles: hydratedBundles,
      collections: allCollections,
      ecosystemPlatforms: allPlatforms,
      orders: allOrders.map((o) => ({
        ...o,
        items: allOrderItems.filter((oi) => oi.orderId === o.id),
      })),
      customers: allUsers,
      subscribers: allSubscribers,
      enquiries: allEnquiries,
      discounts: allDiscounts,
      settings: settingsMap,
      paystackEnvConfigured: paystack.secretKeyConfigured,
      integrationStatus: {
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
      },
      auditLogs: recentAudits,
    });
  } catch (error) {
    console.error('Error loading admin overview:', error);
    res.status(500).json({ error: 'Unable to load admin overview.' });
  }
});

router.post('/products', async (req: AuthRequest, res) => {
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

router.patch('/products/:id', async (req: AuthRequest, res) => {
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

router.delete('/products/:id', async (req: AuthRequest, res) => {
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

router.post('/upload/image', imageUpload.single('file'), async (req: AuthRequest, res) => {
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

router.post('/categories', async (req: AuthRequest, res) => {
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

router.patch('/categories/:id', async (req: AuthRequest, res) => {
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

router.post('/bundles', async (req: AuthRequest, res) => {
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

router.patch('/bundles/:id', async (req: AuthRequest, res) => {
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

router.delete('/bundles/:id', async (req: AuthRequest, res) => {
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

router.patch('/collections/:id', async (req: AuthRequest, res) => {
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

router.post('/discounts', async (req: AuthRequest, res) => {
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

router.patch('/discounts/:id', async (req: AuthRequest, res) => {
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

router.patch('/enquiries/:id', async (req: AuthRequest, res) => {
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

router.post('/orders/:id/refund', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(orders)
      .set({ paymentStatus: 'refunded' })
      .where(eq(orders.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Order not found.' });

    await recordAuditLog({
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      action: 'REFUND_ORDER',
      targetType: 'order',
      targetId: id,
      details: `Marked order ${updated.orderReference} as refunded`,
    });

    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Unable to record refund.' });
  }
});

router.get('/orders/export', async (_req: AuthRequest, res) => {
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

router.patch('/customers/:id/role', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body || {};
    if (role !== 'customer' && role !== 'admin') {
      return res.status(400).json({ error: 'Invalid role.' });
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
      details: `${updated.email} role changed to ${role}`,
    });

    res.json({ customer: updated });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update user role.' });
  }
});

router.post('/ecosystem', async (req: AuthRequest, res) => {
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

router.patch('/ecosystem/:id', async (req: AuthRequest, res) => {
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

router.delete('/ecosystem/:id', async (req: AuthRequest, res) => {
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

router.patch('/settings', async (req: AuthRequest, res) => {
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
