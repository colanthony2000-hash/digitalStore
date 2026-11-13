import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface SupportCaseHistoryEntry {
  timestamp: string;
  actorEmail: string;
  action: string;
  note: string;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  role: text('role').notNull().default('customer'), // 'customer' | 'super_admin' | 'admin' | 'support' | 'finance' | 'ops_monitor'
  accountStatus: text('account_status').notNull().default('active'), // 'active' | 'suspended'
  emailVerified: boolean('email_verified').notNull().default(false),
  authProvider: text('auth_provider').notNull().default('unknown'), // 'password' | 'google.com' | 'multiple'
  linkedUids: jsonb('linked_uids').$type<string[]>().notNull().default([]),
  termsAcceptedAt: timestamp('terms_accepted_at'),
  lastLoginAt: timestamp('last_login_at'),
  lastPasswordResetAt: timestamp('last_password_reset_at'),
  sessionInvalidatedBefore: timestamp('session_invalidated_before'),
  suspendedAt: timestamp('suspended_at'),
  suspendedReason: text('suspended_reason'),
  internalNotes: text('internal_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  subtopics: jsonb('subtopics').$type<string[]>().notNull().default([]),
  imageUrl: text('image_url'),
  ecosystemApp: text('ecosystem_app'),
  ecosystemUrl: text('ecosystem_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  shortBenefit: text('short_benefit').notNull(),
  shortDescription: text('short_description').notNull(),
  fullDescription: text('full_description').notNull(),
  categoryId: integer('category_id').references(() => categories.id, {
    onDelete: 'set null',
  }),
  coverImage: text('cover_image'),
  previewImages: jsonb('preview_images').$type<string[]>().notNull().default([]),
  fileFormat: text('file_format').notNull().default('PDF'),
  fileSize: text('file_size'),
  version: text('version').notNull().default('1.0'),
  contentsList: jsonb('contents_list').$type<string[]>().notNull().default([]),
  keyBenefits: jsonb('key_benefits').$type<string[]>().notNull().default([]),
  intendedAudience: jsonb('intended_audience').$type<string[]>().notNull().default([]),
  requirements: text('requirements'),
  instructions: text('instructions'),
  licenceType: text('licence_type')
    .notNull()
    .default('Single Personal Use Licence'),
  faqs: jsonb('faqs').$type<ProductFaq[]>().notNull().default([]),
  priceNgnKobo: integer('price_ngn_kobo'),
  originalPriceNgnKobo: integer('original_price_ngn_kobo'),
  priceUsdCents: integer('price_usd_cents'),
  originalPriceUsdCents: integer('original_price_usd_cents'),
  isFree: boolean('is_free').notNull().default(false),
  status: text('status').notNull().default('published'), // 'draft' | 'published' | 'archived'
  isFeatured: boolean('is_featured').notNull().default(false),
  isBestseller: boolean('is_bestseller').notNull().default(false),
  isNewArrival: boolean('is_new_arrival').notNull().default(true),
  verifiedSalesCount: integer('verified_sales_count').notNull().default(0),
  checkoutMode: text('checkout_mode').notNull().default('selar'), // 'selar' | 'native' | 'free'
  marketplaceUrl: text('marketplace_url'),
  nativeCheckoutEligible: boolean('native_checkout_eligible')
    .notNull()
    .default(false),
  protectedFilePath: text('protected_file_path'),
  ecosystemName: text('ecosystem_name'),
  ecosystemUrl: text('ecosystem_url'),
  ecosystemPitch: text('ecosystem_pitch'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  sortOrder: integer('sort_order').notNull().default(0),
  relatedProductIds: jsonb('related_product_ids').$type<number[]>().notNull().default([]),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ecosystemPlatforms = pgTable('ecosystem_platforms', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  relatedCategorySlug: text('related_category_slug'),
  description: text('description').notNull(),
  destinationUrl: text('destination_url'),
  iconName: text('icon_name').notNull().default('Layers'),
  logoUrl: text('logo_url'),
  status: text('status').notNull().default('published'), // 'published' | 'draft' | 'archived'
  isFeatured: boolean('is_featured').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bundles = pgTable('bundles', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  coverImage: text('cover_image'),
  priceNgnKobo: integer('price_ngn_kobo'),
  priceUsdCents: integer('price_usd_cents'),
  marketplaceUrl: text('marketplace_url'),
  checkoutMode: text('checkout_mode').notNull().default('selar'),
  status: text('status').notNull().default('draft'), // 'draft' | 'published' | 'archived'
  isFeatured: boolean('is_featured').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bundleItems = pgTable('bundle_items', {
  id: serial('id').primaryKey(),
  bundleId: integer('bundle_id')
    .references(() => bundles.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
});

export const collections = pgTable('collections', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  productIds: jsonb('product_ids').$type<number[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderReference: text('order_reference').notNull().unique(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  customerEmail: text('customer_email').notNull(),
  customerName: text('customer_name'),
  currency: text('currency').notNull().default('NGN'),
  subtotalMinor: integer('subtotal_minor').notNull(),
  discountMinor: integer('discount_minor').notNull().default(0),
  totalMinor: integer('total_minor').notNull(),
  discountCode: text('discount_code'),
  paymentProvider: text('payment_provider').notNull().default('paystack'),
  paymentStatus: text('payment_status').notNull().default('pending'), // 'pending' | 'paid' | 'failed' | 'refunded'
  orderStatus: text('order_status').notNull().default('created'), // 'created' | 'completed' | 'cancelled' | 'refunded'
  checkoutDestination: text('checkout_destination').notNull().default('native'), // 'native' | 'selar'
  fulfilmentStatus: text('fulfilment_status').notNull().default('pending'), // 'pending' | 'fulfilled' | 'failed'
  paystackReference: text('paystack_reference').unique(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id').references(() => products.id, {
    onDelete: 'set null',
  }),
  productName: text('product_name').notNull(),
  productVersion: text('product_version').notNull().default('1.0'),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  downloadCount: integer('download_count').notNull().default(0),
  maxDownloads: integer('max_downloads').notNull().default(10),
});

export const downloadLogs = pgTable('download_logs', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id').references(() => orderItems.id, {
    onDelete: 'cascade',
  }),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  email: text('email'),
  ipAddress: text('ip_address'),
  downloadedAt: timestamp('downloaded_at').defaultNow().notNull(),
});

export const discountCodes = pgTable('discount_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').notNull().default('percent'), // 'percent' | 'fixed_ngn' | 'fixed_usd'
  value: integer('value').notNull(),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name'),
  source: text('source').notNull().default('footer'),
  freeResourceSlug: text('free_resource_slug'),
  subscribedAt: timestamp('subscribed_at').defaultNow().notNull(),
});

export const supportEnquiries = pgTable('support_enquiries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  productSlug: text('product_slug'),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'), // 'open' | 'in_progress' | 'resolved'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const supportCases = pgTable('support_cases', {
  id: serial('id').primaryKey(),
  caseReference: text('case_reference').notNull().unique(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  category: text('category').notNull().default('general_enquiry'),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  relatedProductSlug: text('related_product_slug'),
  relatedOrderId: integer('related_order_id').references(() => orders.id, {
    onDelete: 'set null',
  }),
  transactionReference: text('transaction_reference'),
  status: text('status').notNull().default('open'), // 'open' | 'in_progress' | 'resolved' | 'escalated'
  priority: text('priority').notNull().default('normal'), // 'low' | 'normal' | 'high' | 'urgent'
  assignedAdminEmail: text('assigned_admin_email'),
  internalNotes: text('internal_notes'),
  resolutionSummary: text('resolution_summary'),
  resolutionHistory: jsonb('resolution_history')
    .$type<SupportCaseHistoryEntry[]>()
    .notNull()
    .default([]),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const accountEvents = pgTable('account_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  email: text('email'),
  eventType: text('event_type').notNull(),
  details: text('details'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const systemEvents = pgTable('system_events', {
  id: serial('id').primaryKey(),
  component: text('component').notNull(), // 'application' | 'database' | 'storage' | 'authentication' | 'payments' | 'email' | 'integrations'
  severity: text('severity').notNull().default('info'), // 'info' | 'warning' | 'error'
  eventType: text('event_type').notNull(),
  message: text('message').notNull(),
  details: text('details'),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailLogs = pgTable('email_logs', {
  id: serial('id').primaryKey(),
  recipientEmail: text('recipient_email').notNull(),
  fromAddress: text('from_address').notNull(),
  replyTo: text('reply_to'),
  subject: text('subject').notNull(),
  category: text('category').notNull(),
  provider: text('provider').notNull(), // 'smtp' | 'resend' | 'firebase_auth' | 'unconfigured'
  status: text('status').notNull(), // 'sent' | 'failed' | 'not_configured'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const analyticsEvents = pgTable('analytics_events', {
  id: serial('id').primaryKey(),
  eventType: text('event_type').notNull(),
  productId: integer('product_id').references(() => products.id, {
    onDelete: 'set null',
  }),
  productSlug: text('product_slug'),
  categorySlug: text('category_slug'),
  referrer: text('referrer'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  countryCode: text('country_code'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeSettings = pgTable('store_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  adminUid: text('admin_uid').notNull(),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  details: text('details'),
  reason: text('reason'),
  result: text('result').notNull().default('success'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  bundleItems: many(bundleItems),
}));

export const bundlesRelations = relations(bundles, ({ many }) => ({
  items: many(bundleItems),
}));

export const bundleItemsRelations = relations(bundleItems, ({ one }) => ({
  bundle: one(bundles, {
    fields: [bundleItems.bundleId],
    references: [bundles.id],
  }),
  product: one(products, {
    fields: [bundleItems.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));
