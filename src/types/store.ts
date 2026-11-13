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
  role: 'customer' | 'admin';
}
