import type { CurrencyCode, Product } from '../types/store';

export function formatMinorPrice(
  minorAmount: number | null | undefined,
  currency: CurrencyCode
): string | null {
  if (minorAmount === null || minorAmount === undefined) return null;
  const major = minorAmount / 100;
  if (currency === 'NGN') {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: major % 1 === 0 ? 0 : 2,
    }).format(major);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
}

export function getProductDisplayPrice(
  product: Pick<
    Product,
    | 'isFree'
    | 'priceNgnKobo'
    | 'originalPriceNgnKobo'
    | 'priceUsdCents'
    | 'originalPriceUsdCents'
  >,
  currency: CurrencyCode
): {
  current: string;
  original: string | null;
  isConfigured: boolean;
  minorValue: number | null;
} {
  if (product.isFree) {
    return {
      current: 'Free Download',
      original: null,
      isConfigured: true,
      minorValue: 0,
    };
  }

  const minor =
    currency === 'NGN' ? product.priceNgnKobo : product.priceUsdCents;
  const origMinor =
    currency === 'NGN'
      ? product.originalPriceNgnKobo
      : product.originalPriceUsdCents;

  const formatted = formatMinorPrice(minor, currency);
  const formattedOrig = formatMinorPrice(origMinor, currency);

  if (!formatted) {
    const fallbackMinor =
      currency === 'NGN' ? product.priceUsdCents : product.priceNgnKobo;
    const fallbackCurrency: CurrencyCode = currency === 'NGN' ? 'USD' : 'NGN';
    const fallbackFormatted = formatMinorPrice(fallbackMinor, fallbackCurrency);
    if (fallbackFormatted) {
      return {
        current: fallbackFormatted,
        original: null,
        isConfigured: true,
        minorValue: fallbackMinor ?? null,
      };
    }
    return {
      current: 'Price Pending Setup',
      original: null,
      isConfigured: false,
      minorValue: null,
    };
  }

  return {
    current: formatted,
    original: formattedOrig,
    isConfigured: true,
    minorValue: minor ?? null,
  };
}

export function extractUtmParams(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
} {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    referrer: document.referrer || undefined,
  };
}

export function buildSelarCheckoutUrl(
  rawUrl: string,
  productSlug: string,
  medium: 'product_card' | 'product_page' | 'bundle'
): string {
  const trimmed = rawUrl.trim();
  try {
    const targetUrl = new URL(trimmed);
    if (!targetUrl.searchParams.has('utm_source')) {
      targetUrl.searchParams.set('utm_source', 'jeneconk_digital_store');
      targetUrl.searchParams.set('utm_medium', medium);
      targetUrl.searchParams.set('utm_campaign', productSlug);
    }
    return targetUrl.toString();
  } catch {
    return trimmed;
  }
}

