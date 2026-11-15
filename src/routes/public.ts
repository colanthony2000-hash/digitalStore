import crypto from 'crypto';
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
  supportCases,
  supportEnquiries,
  users,
} from '../db/schema.ts';
import { ensureSeeded } from '../db/seed.ts';
import { optionalAuth, type AuthRequest } from '../middleware/auth.ts';
import { createRateLimiter, signDownloadToken } from '../lib/security.ts';
import {
  getGoogleAnalyticsConfig,
  getPaystackConfig,
  getPinterestConfig,
} from '../lib/integrations.ts';
import { sendTransactionalEmail } from '../lib/email.ts';
import { recordAccountEvent } from '../lib/telemetry.ts';
import { objectExists, objectKeyFromProductPath } from '../lib/object-storage.ts';

const router = Router();
const publicWriteLimiter = createRateLimiter(30, 60_000);
const authEventLimiter = createRateLimiter(20, 60_000);

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
        paystackWebhookConfigured: paystack.webhookVerificationConfigured,
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
        supportEmail:
          settings.support_email && settings.support_email !== 'support@jeneconk.com'
            ? settings.support_email
            : 'info@jeneconk.com',
        businessEmail: settings.business_email || 'business@jeneconk.com',
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
    let redirectUrl: string | null = null;
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
        const protectedKey = freeProd[0].protectedFilePath
          ? objectKeyFromProductPath(freeProd[0].protectedFilePath)
          : null;
        const hasFile = protectedKey ? await objectExists(protectedKey) : false;

        if (hasFile) {
          const token = signDownloadToken({
            productId: freeProd[0].id,
            orderItemId: null,
            userId: null,
            email: normalizedEmail,
          });
          downloadUrl = `/api/downloads/${token}`;
        } else if (freeProd[0].marketplaceUrl) {
          try {
            const fallback = new URL(freeProd[0].marketplaceUrl);
            if (
              fallback.protocol === 'https:' &&
              (fallback.hostname === 'selar.com' || fallback.hostname.endsWith('.selar.com'))
            ) {
              redirectUrl = fallback.toString();
            }
          } catch {
            // Ignore malformed marketplace links; never return them as redirects.
          }
        }
      }
    }

    res.json({
      subscribed: true,
      downloadUrl,
      redirectUrl,
      message: downloadUrl
        ? 'Subscribed. Your free resource download link is ready below.'
        : redirectUrl
        ? 'Subscribed. Continue to Selar to claim your free resource.'
        : 'Thank you for subscribing to Jeneconk Digital Store updates.',
    });
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ error: 'Unable to complete subscription.' });
  }
});

router.post('/auth/event', authEventLimiter, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { eventType, details, termsAccepted } = req.body || {};
    const allowed = new Set([
      'registered',
      'login_password',
      'login_google',
      'login_failed',
      'email_verified',
      'password_reset_requested',
    ]);
    if (typeof eventType !== 'string' || !allowed.has(eventType)) {
      return res.status(400).json({ error: 'Invalid authentication event type.' });
    }

    if (req.dbUser && termsAccepted === true && !req.dbUser.termsAcceptedAt) {
      await db
        .update(users)
        .set({ termsAcceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, req.dbUser.id));
    }

    const ipAddress = (req.ip || req.socket.remoteAddress || '').slice(0, 64);
    await recordAccountEvent({
      userId: req.dbUser?.id ?? null,
      email: req.dbUser?.email ?? null,
      eventType,
      details: typeof details === 'string' ? details.slice(0, 240) : null,
      ipAddress,
    });

    res.json({ recorded: true });
  } catch (error) {
    console.error('Error recording auth event:', error);
    res.status(500).json({ error: 'Unable to record auth event.' });
  }
});

router.post('/support/enquiry', publicWriteLimiter, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { name, email, subject, productSlug, message, category, transactionReference } =
      req.body || {};

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

    const cleanEmail = email.trim().toLowerCase().slice(0, 160);
    const cleanName = name.trim().slice(0, 120);
    const cleanSubject = subject.trim().slice(0, 180);
    const cleanMessage = message.trim().slice(0, 4000);
    const cleanProd =
      typeof productSlug === 'string' && productSlug.trim()
        ? productSlug.trim().slice(0, 120)
        : null;

    const inserted = await db
      .insert(supportEnquiries)
      .values({
        userId: req.dbUser?.id ?? null,
        name: cleanName,
        email: cleanEmail,
        subject: cleanSubject,
        productSlug: cleanProd,
        message: cleanMessage,
      })
      .returning();

    const caseReference = `JNK-SUP-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;

    await db.insert(supportCases).values({
      caseReference,
      userId: req.dbUser?.id ?? null,
      customerName: cleanName,
      customerEmail: cleanEmail,
      category:
        typeof category === 'string' && category.trim()
          ? category.trim().slice(0, 60)
          : 'general_enquiry',
      subject: cleanSubject,
      description: cleanMessage,
      relatedProductSlug: cleanProd,
      transactionReference:
        typeof transactionReference === 'string' && transactionReference.trim()
          ? transactionReference.trim().slice(0, 120)
          : null,
      status: 'open',
      priority: 'normal',
      resolutionHistory: [
        {
          timestamp: new Date().toISOString(),
          actorEmail: cleanEmail,
          action: 'CASE_CREATED',
          note: 'Submitted via Store Contact & Support form.',
        },
      ],
    });

    if (req.dbUser) {
      await recordAccountEvent({
        userId: req.dbUser.id,
        email: req.dbUser.email,
        eventType: 'support_case_opened',
        details: `Case ${caseReference}: ${cleanSubject}`,
      });
    }

    // Attempt optional customer/support email notification cleanly
    const settings = await getSettingsMap();
    const supportInbox =
      settings.support_email && settings.support_email !== 'support@jeneconk.com'
        ? settings.support_email
        : 'info@jeneconk.com';

    await sendTransactionalEmail({
      to: supportInbox,
      replyTo: cleanEmail,
      subject: `[${caseReference}] New Support Request: ${cleanSubject}`,
      text: `Case Reference: ${caseReference}\nFrom: ${cleanName} (${cleanEmail})\nProduct: ${
        cleanProd || 'General'
      }\n\n${cleanMessage}`,
      category: 'support_notification',
    });

    res.status(201).json({
      submitted: true,
      enquiryId: inserted[0].id,
      caseReference,
      message: `Your support request (${caseReference}) has been received by Jeneconk Customer Assistance.`,
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
