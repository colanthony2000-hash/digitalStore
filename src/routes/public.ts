import { Router } from 'express';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  analyticsEvents,
  bundleItems,
  bundles,
  categories,
  collections,
  discountCodes,
  ecosystemPlatforms,
  newsletterSubscribers,
  products,
  storeSettings,
  supportEnquiries,
} from '../db/schema.ts';
import { ensureSeeded } from '../db/seed.ts';
import { optionalAuth, type AuthRequest } from '../middleware/auth.ts';
import { createRateLimiter, signDownloadToken } from '../lib/security.ts';
import {
  getGoogleAnalyticsConfig,
  getPaystackConfig,
  getPinterestConfig,
} from '../lib/integrations.ts';

const router = Router();
const publicWriteLimiter = createRateLimiter(30, 60_000);

export function sanitizeProductForPublic(p: typeof products.$inferSelect) {
  const { protectedFilePath, ...safe } = p;
  return {
    ...safe,
    hasProtectedFile: Boolean(protectedFilePath),
  };
}

async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(storeSettings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

router.get('/storefront', async (_req, res) => {
  try {
    await ensureSeeded();
    const [
      allCategories,
      allProducts,
      allBundles,
      allBundleItems,
      allCollections,
      allPlatforms,
      settings,
    ] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder), asc(categories.id)),
      db
        .select()
        .from(products)
        .where(eq(products.status, 'published'))
        .orderBy(asc(products.sortOrder), desc(products.isFeatured), desc(products.publishedAt)),
      db
        .select()
        .from(bundles)
        .where(eq(bundles.status, 'published'))
        .orderBy(desc(bundles.isFeatured), desc(bundles.createdAt)),
      db.select().from(bundleItems),
      db
        .select()
        .from(collections)
        .where(eq(collections.isActive, true))
        .orderBy(asc(collections.sortOrder)),
      db
        .select()
        .from(ecosystemPlatforms)
        .where(eq(ecosystemPlatforms.status, 'published'))
        .orderBy(asc(ecosystemPlatforms.sortOrder), asc(ecosystemPlatforms.id)),
      getSettingsMap(),
    ]);

    const safeProducts = allProducts.map(sanitizeProductForPublic);
    const productById = new Map(safeProducts.map((p) => [p.id, p]));

    const hydratedBundles = allBundles.map((b) => ({
      ...b,
      products: allBundleItems
        .filter((bi) => bi.bundleId === b.id)
        .map((bi) => productById.get(bi.productId))
        .filter(Boolean),
    }));

    const hydratedCollections = allCollections.map((c) => ({
      ...c,
      products: (c.productIds || [])
        .map((pid) => productById.get(pid))
        .filter(Boolean),
    }));

    const paystack = getPaystackConfig(settings.native_checkout_enabled === 'true');
    const pinterest = getPinterestConfig(settings.pinterest_tag_id);
    const ga = getGoogleAnalyticsConfig(settings.ga_measurement_id);

    res.json({
      categories: allCategories,
      products: safeProducts,
      bundles: hydratedBundles,
      collections: hydratedCollections,
      ecosystemPlatforms: allPlatforms,
      settings: {
        nativeCheckoutEnabled: paystack.nativeCheckoutActive,
        nativeCheckoutToggle: paystack.nativeCheckoutToggle,
        paystackConfigured: paystack.secretKeyConfigured,
        paystackWebhookConfigured: paystack.webhookSecretConfigured,
        paystackPublicKey:
          paystack.nativeCheckoutActive && paystack.publicKeyConfigured
            ? paystack.publicKey
            : '',
        promoBannerEnabled: settings.promo_banner_enabled === 'true',
        promoBannerText: settings.promo_banner_text || '',
        heroKicker: settings.hero_kicker || 'Jeneconk Integrated Global Solutions',
        freePromoHeadline:
          settings.free_promo_headline || 'Starter Guides & Store Releases',
        freePromoSubtext:
          settings.free_promo_subtext ||
          'Receive new digital edition announcements, complimentary starter guides, and seasonal planning kits directly from Jeneconk Digital Store.',
        supportEmail: settings.support_email || 'support@jeneconk.com',
        whatsappNumber: settings.whatsapp_number || '',
        pinterestTagId: pinterest.tagId,
        pinterestTagConfigured: pinterest.configured,
        gaMeasurementId: ga.measurementId,
        gaConfigured: ga.configured,
      },
    });
  } catch (error) {
    console.error('Error loading storefront:', error);
    res.status(500).json({ error: 'Unable to load storefront catalog.' });
  }
});

router.get('/products', async (req, res) => {
  try {
    await ensureSeeded();
    const { category, search, featured, bestseller, newArrival, free, format } =
      req.query;

    const conditions = [eq(products.status, 'published')];

    if (typeof category === 'string' && category.trim()) {
      const cat = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, category.trim()))
        .limit(1);
      if (cat.length > 0) {
        conditions.push(eq(products.categoryId, cat[0].id));
      } else {
        return res.json({ products: [] });
      }
    }

    if (featured === 'true') conditions.push(eq(products.isFeatured, true));
    if (bestseller === 'true') conditions.push(eq(products.isBestseller, true));
    if (newArrival === 'true') conditions.push(eq(products.isNewArrival, true));
    if (free === 'true') conditions.push(eq(products.isFree, true));
    if (typeof format === 'string' && format.trim()) {
      conditions.push(eq(products.fileFormat, format.trim().toUpperCase()));
    }

    if (typeof search === 'string' && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(products.name, term),
          ilike(products.shortBenefit, term),
          ilike(products.shortDescription, term)
        )!
      );
    }

    const rows = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.sortOrder), desc(products.isFeatured), desc(products.publishedAt));

    res.json({ products: rows.map(sanitizeProductForPublic) });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Unable to load products.' });
  }
});

router.get('/products/:slug', async (req, res) => {
  try {
    await ensureSeeded();
    const { slug } = req.params;
    const found = await db
      .select()
      .from(products)
      .where(and(eq(products.slug, slug), eq(products.status, 'published')))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const product = found[0];
    let category = null;
    if (product.categoryId) {
      const cats = await db
        .select()
        .from(categories)
        .where(eq(categories.id, product.categoryId))
        .limit(1);
      category = cats[0] || null;
    }

    const [allPublished, allPlatforms] = await Promise.all([
      db
        .select()
        .from(products)
        .where(eq(products.status, 'published'))
        .orderBy(asc(products.sortOrder), desc(products.isFeatured)),
      db
        .select()
        .from(ecosystemPlatforms)
        .where(eq(ecosystemPlatforms.status, 'published'))
        .orderBy(asc(ecosystemPlatforms.sortOrder), asc(ecosystemPlatforms.id)),
    ]);

    const explicitIds = new Set(
      Array.isArray(product.relatedProductIds) ? product.relatedProductIds : []
    );
    const explicitRelated = allPublished.filter(
      (r) => r.id !== product.id && explicitIds.has(r.id)
    );
    const sameCategoryFallback = allPublished.filter(
      (r) =>
        r.id !== product.id &&
        !explicitIds.has(r.id) &&
        r.categoryId === product.categoryId
    );
    const otherFallback = allPublished.filter(
      (r) =>
        r.id !== product.id &&
        !explicitIds.has(r.id) &&
        r.categoryId !== product.categoryId
    );

    const related = [...explicitRelated, ...sameCategoryFallback, ...otherFallback]
      .slice(0, 3)
      .map(sanitizeProductForPublic);

    const contextualPlatforms = category
      ? allPlatforms
          .filter(
            (pl) =>
              pl.relatedCategorySlug === category.slug &&
              pl.name.toLowerCase() !== (product.ecosystemName || '').toLowerCase()
          )
          .slice(0, 2)
      : [];

    res.json({
      product: sanitizeProductForPublic(product),
      category,
      relatedProducts: related,
      contextualPlatforms,
    });
  } catch (error) {
    console.error('Error fetching product detail:', error);
    res.status(500).json({ error: 'Unable to load product details.' });
  }
});

router.post('/analytics/event', publicWriteLimiter, async (req, res) => {
  try {
    const {
      eventType,
      productId,
      productSlug,
      categorySlug,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
    } = req.body || {};

    const allowedTypes = new Set([
      'product_view',
      'selar_outbound_click',
      'free_resource_download',
      'category_view',
      'search',
    ]);

    if (!eventType || !allowedTypes.has(eventType)) {
      return res.status(400).json({ error: 'Invalid analytics event type.' });
    }

    const countryHeader =
      (req.headers['cf-ipcountry'] as string) ||
      (req.headers['x-appengine-country'] as string) ||
      null;

    await db.insert(analyticsEvents).values({
      eventType,
      productId: typeof productId === 'number' ? productId : null,
      productSlug: typeof productSlug === 'string' ? productSlug.slice(0, 140) : null,
      categorySlug:
        typeof categorySlug === 'string' ? categorySlug.slice(0, 140) : null,
      referrer: typeof referrer === 'string' ? referrer.slice(0, 300) : null,
      utmSource: typeof utmSource === 'string' ? utmSource.slice(0, 100) : null,
      utmMedium: typeof utmMedium === 'string' ? utmMedium.slice(0, 100) : null,
      utmCampaign:
        typeof utmCampaign === 'string' ? utmCampaign.slice(0, 140) : null,
      countryCode: countryHeader ? countryHeader.slice(0, 8) : null,
    });

    res.json({ recorded: true });
  } catch (error) {
    console.error('Error recording analytics event:', error);
    res.status(500).json({ error: 'Failed to record event.' });
  }
});

router.post('/newsletter/subscribe', publicWriteLimiter, async (req, res) => {
  try {
    const { email, fullName, source, freeResourceSlug } = req.body || {};
    if (
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    await db
      .insert(newsletterSubscribers)
      .values({
        email: normalizedEmail,
        fullName: typeof fullName === 'string' ? fullName.trim().slice(0, 120) : null,
        source: typeof source === 'string' ? source.slice(0, 40) : 'footer',
        freeResourceSlug:
          typeof freeResourceSlug === 'string'
            ? freeResourceSlug.slice(0, 120)
            : null,
      })
      .onConflictDoUpdate({
        target: newsletterSubscribers.email,
        set: {
          fullName:
            typeof fullName === 'string' && fullName.trim()
              ? fullName.trim().slice(0, 120)
              : undefined,
          freeResourceSlug:
            typeof freeResourceSlug === 'string'
              ? freeResourceSlug.slice(0, 120)
              : undefined,
        },
      });

    let downloadUrl: string | null = null;
    if (typeof freeResourceSlug === 'string' && freeResourceSlug.trim()) {
      const freeProd = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.slug, freeResourceSlug.trim()),
            eq(products.isFree, true),
            eq(products.status, 'published')
          )
        )
        .limit(1);

      if (freeProd.length > 0) {
        const token = signDownloadToken({
          productId: freeProd[0].id,
          orderItemId: null,
          userId: null,
          email: normalizedEmail,
        });
        downloadUrl = `/api/downloads/${token}`;
      }
    }

    res.json({
      subscribed: true,
      downloadUrl,
      message: downloadUrl
        ? 'Subscribed. Your free resource download link is ready below.'
        : 'Thank you for subscribing to Jeneconk Digital Store updates.',
    });
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ error: 'Unable to complete subscription.' });
  }
});

router.post('/support/enquiry', publicWriteLimiter, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { name, email, subject, productSlug, message } = req.body || {};

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof subject !== 'string' ||
      !subject.trim() ||
      typeof message !== 'string' ||
      message.trim().length < 5
    ) {
      return res.status(400).json({
        error: 'Please complete your name, valid email, subject, and message.',
      });
    }

    const inserted = await db
      .insert(supportEnquiries)
      .values({
        userId: req.dbUser?.id ?? null,
        name: name.trim().slice(0, 120),
        email: email.trim().toLowerCase().slice(0, 160),
        subject: subject.trim().slice(0, 180),
        productSlug:
          typeof productSlug === 'string' && productSlug.trim()
            ? productSlug.trim().slice(0, 120)
            : null,
        message: message.trim().slice(0, 4000),
      })
      .returning();

    res.status(201).json({
      submitted: true,
      enquiryId: inserted[0].id,
      message: 'Your support request has been received by Jeneconk Customer Assistance.',
    });
  } catch (error) {
    console.error('Error creating support enquiry:', error);
    res.status(500).json({ error: 'Unable to submit support request.' });
  }
});

router.post('/discounts/validate', publicWriteLimiter, async (req, res) => {
  try {
    const { code, currency, subtotalMinor } = req.body || {};
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Discount code is required.' });
    }

    const found = await db
      .select()
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.code, code.trim().toUpperCase()),
          eq(discountCodes.isActive, true)
        )
      )
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Discount code not found or inactive.' });
    }

    const dc = found[0];
    if (dc.expiresAt && dc.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'This discount code has expired.' });
    }
    if (dc.maxUses !== null && dc.usedCount >= dc.maxUses) {
      return res.status(400).json({ error: 'This discount code has reached its usage limit.' });
    }

    const subtotal = typeof subtotalMinor === 'number' && subtotalMinor > 0 ? subtotalMinor : 0;
    let discountMinor = 0;
    if (dc.discountType === 'percent') {
      discountMinor = Math.round((subtotal * dc.value) / 100);
    } else if (dc.discountType === 'fixed_ngn' && currency === 'NGN') {
      discountMinor = Math.min(subtotal, dc.value * 100);
    } else if (dc.discountType === 'fixed_usd' && currency === 'USD') {
      discountMinor = Math.min(subtotal, dc.value * 100);
    }

    res.json({
      valid: true,
      code: dc.code,
      discountType: dc.discountType,
      value: dc.value,
      discountMinor,
    });
  } catch (error) {
    console.error('Error validating discount code:', error);
    res.status(500).json({ error: 'Unable to validate discount code.' });
  }
});

export default router;
