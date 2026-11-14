import type { AdminPermission, UserRole } from '../lib/rbac';

export type CurrencyCode = 'NGN' | 'USD';

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  subtopics: string[];
  imageUrl: string | null;
  ecosystemApp: string | null;
  ecosystemUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  shortBenefit: string;
  shortDescription: string;
  fullDescription: string;
  categoryId: number | null;
  coverImage: string | null;
  previewImages: string[];
  fileFormat: string;
  fileSize: string | null;
  version: string;
  contentsList: string[];
  keyBenefits: string[];
  intendedAudience: string[];
  requirements: string | null;
  instructions: string | null;
  licenceType: string;
  faqs: ProductFaq[];
  priceNgnKobo: number | null;
  originalPriceNgnKobo: number | null;
  priceUsdCents: number | null;
  originalPriceUsdCents: number | null;
  isFree: boolean;
  status: string;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
  verifiedSalesCount: number;
  checkoutMode: string;
  marketplaceUrl: string | null;
  nativeCheckoutEligible: boolean;
  hasProtectedFile?: boolean;
  ecosystemName: string | null;
  ecosystemUrl: string | null;
  ecosystemPitch: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  sortOrder: number;
  relatedProductIds: number[];
  publishedAt: string;
  updatedAt: string;
}

export interface EcosystemPlatform {
  id: number;
  slug: string;
  name: string;
  category: string;
  relatedCategorySlug: string | null;
  description: string;
  destinationUrl: string | null;
  iconName: string;
  logoUrl: string | null;
  status: string;
  isFeatured: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Bundle {
  id: number;
  slug: string;
  name: string;
  description: string;
  coverImage: string | null;
  priceNgnKobo: number | null;
  priceUsdCents: number | null;
  marketplaceUrl: string | null;
  checkoutMode: string;
  status: string;
  isFeatured: boolean;
  products?: Product[];
  productIds?: number[];
}

export interface StoreCollection {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  productIds: number[];
  isActive: boolean;
  sortOrder: number;
  products?: Product[];
}

export interface StoreSettingsPublic {
  nativeCheckoutEnabled: boolean;
  nativeCheckoutToggle: boolean;
  paystackConfigured: boolean;
  paystackWebhookConfigured: boolean;
  paystackPublicKey: string;
  promoBannerEnabled: boolean;
  promoBannerText: string;
  heroKicker?: string;
  freePromoHeadline?: string;
  freePromoSubtext?: string;
  supportEmail: string;
  businessEmail?: string;
  whatsappNumber: string;
  pinterestTagId: string;
  pinterestTagConfigured: boolean;
  gaMeasurementId: string;
  gaConfigured: boolean;
}

export interface AuthUserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  accountStatus: 'active' | 'suspended';
  emailVerified: boolean;
  authProvider: string;
  termsAcceptedAt?: string | null;
  lastLoginAt?: string | null;
  suspendedReason?: string | null;
  createdAt?: string;
  permissions?: AdminPermission[];
}

export interface SupportCaseHistoryEntry {
  timestamp: string;
  actorEmail: string;
  action: string;
  note: string;
}

export interface SupportCaseRecord {
  id: number;
  caseReference: string;
  userId: number | null;
  customerName: string;
  customerEmail: string;
  category: string;
  subject: string;
  description: string;
  relatedProductSlug: string | null;
  relatedOrderId: number | null;
  transactionReference: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'escalated';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedAdminEmail: string | null;
  internalNotes?: string | null;
  resolutionSummary: string | null;
  resolutionHistory: SupportCaseHistoryEntry[];
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountEventRecord {
  id: number;
  userId: number | null;
  email: string | null;
  eventType: string;
  details: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface InfraComponentReport {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'not_configured' | 'partial' | 'unknown';
  statusLabel: string;
  lastCheckedAt: string;
  lastErrorAt: string | null;
  errorSummary: string | null;
  recommendedAction: string;
  metrics: { label: string; value: string }[];
}

export interface SystemEventRecord {
  id: number;
  component: string;
  severity: 'info' | 'warning' | 'error';
  eventType: string;
  message: string;
  details: string | null;
  resolved: boolean;
  createdAt: string;
}

export interface EmailLogRecord {
  id: number;
  recipientEmail: string;
  fromAddress: string;
  replyTo: string | null;
  subject: string;
  category: string;
  provider: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}
