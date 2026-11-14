import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lock,
  Share2,
  ShoppingBag,
} from 'lucide-react';
import { EcosystemIcon } from '../components/EcosystemIcon';
import { ProductCard } from '../components/ProductCard';
import { ProductMockup } from '../components/ProductMockup';
import { SeoHead } from '../components/SeoHead';
import { useStore } from '../context/StoreContext';
import { buildSelarCheckoutUrl, getProductDisplayPrice } from '../lib/format';
import type { Category, EcosystemPlatform, Product } from '../types/store';

export function ProductDetailPage({ slug }: { slug: string }) {
  const {
    currency,
    categories,
    navigate,
    settings,
    addToCart,
    profile,
    trackEvent,
  } = useStore();

  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [contextualPlatforms, setContextualPlatforms] = useState<EcosystemPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Free resource email unlock state
  const [freeEmail, setFreeEmail] = useState('');
  const [freeDownloadUrl, setFreeDownloadUrl] = useState<string | null>(null);
  const [freeStatus, setFreeStatus] = useState<string | null>(null);
  const [freeSubmitting, setFreeSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setFreeDownloadUrl(null);
    setFreeStatus(null);

    fetch(`/api/products/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Digital product not found.');
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setProduct(data.product);
        setCategory(data.category);
        setRelated(data.relatedProducts || []);
        setContextualPlatforms(data.contextualPlatforms || []);
        setActiveImage(data.product?.coverImage || null);

        trackEvent({
          eventType: 'product_view',
          productId: data.product.id,
          productSlug: data.product.slug,
        });
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Unable to load product.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, trackEvent]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-6 aspect-[4/4.5] bg-white border border-[#E4DDD0] rounded-sm animate-pulse" />
          <div className="lg:col-span-6 space-y-4">
            <div className="h-8 w-2/3 bg-[#E4DDD0] rounded-sm animate-pulse" />
            <div className="h-24 w-full bg-[#E4DDD0] rounded-sm animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold text-[#171A21]">
          Edition Not Available
        </h1>
        <p className="mt-2 text-sm text-[#4A505C]">
          {error || 'The requested digital edition could not be located.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/shop')}
          className="mt-6 px-6 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] rounded-sm"
        >
          Return to Store Catalog
        </button>
      </div>
    );
  }

  const price = getProductDisplayPrice(product, currency);
  const hasSelarUrl = Boolean(product.marketplaceUrl && product.marketplaceUrl.trim());
  const selarHref = hasSelarUrl
    ? buildSelarCheckoutUrl(product.marketplaceUrl!, product.slug, 'product_page')
    : null;
  const canUseNative =
    settings.nativeCheckoutEnabled &&
    product.nativeCheckoutEligible &&
    price.isConfigured &&
    !product.isFree;

  const gallery = Array.from(
    new Set([product.coverImage, ...(product.previewImages || [])].filter(Boolean))
  ) as string[];

  const pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(
    window.location.href
  )}&description=${encodeURIComponent(
    `${product.name} — ${product.shortBenefit} | Jeneconk Digital Store`
  )}`;

  const trackSelarClick = () => {
    trackEvent({
      eventType: 'selar_outbound_click',
      productId: product.id,
      productSlug: product.slug,
    });
  };

  const handleFreeUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (freeSubmitting) return;
    setFreeSubmitting(true);
    setFreeStatus(null);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: freeEmail,
          source: 'free_resource',
          freeResourceSlug: product.slug,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFreeStatus(data.error || 'Unable to process request.');
        return;
      }
      setFreeDownloadUrl(data.downloadUrl || data.redirectUrl || null);
      setFreeStatus(data.message);
      trackEvent({
        eventType: 'free_resource_download',
        productId: product.id,
        productSlug: product.slug,
      });
    } catch {
      setFreeStatus('Network error. Please try again.');
    } finally {
      setFreeSubmitting(false);
    }
  };

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    image: product.coverImage ? `${window.location.origin}${product.coverImage}` : undefined,
    brand: {
      '@type': 'Brand',
      name: 'Jeneconk Digital Store',
    },
    category: category?.name || 'Digital Products',
  };

  if (price.isConfigured && price.minorValue !== null) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: (price.minorValue / 100).toFixed(2),
      priceCurrency: currency,
      availability: 'https://schema.org/InStock',
      url: window.location.href,
    };
  }

  return (
    <div className="bg-[#FAF8F4] pb-20 sm:pb-0">
      <SeoHead
        title={product.seoTitle || `${product.name} | Jeneconk Digital Store`}
        description={product.seoDescription || product.shortDescription}
        path={`/products/${product.slug}`}
        image={product.coverImage}
        type="product"
        jsonLd={jsonLd}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="text-xs text-[#6D7380] flex items-center gap-2 mb-8">
          <button type="button" onClick={() => navigate('/')} className="hover:text-[#171A21]">
            Home
          </button>
          <span aria-hidden="true">/</span>
          {category ? (
            <>
              <button
                type="button"
                onClick={() => navigate(`/categories/${category.slug}`)}
                className="hover:text-[#171A21]"
              >
                {category.name}
              </button>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span className="text-[#171A21] font-medium">{product.name}</span>
        </nav>

        {/* Contiguous Top Split: Sticky Tactile Mockup Gallery Left + Purchase Module Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left: Product Gallery */}
          <div className="lg:col-span-6 lg:sticky lg:top-24 space-y-4">
            <div className="aspect-[4/4.6] w-full rounded-sm overflow-hidden border border-[#D5CCB9] bg-white">
              <ProductMockup
                product={product}
                overrideImage={activeImage}
                categoryName={category?.name}
                variant="detail"
              />
            </div>

            {gallery.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {gallery.map((imgUrl, idx) => (
                  <button
                    key={imgUrl + idx}
                    type="button"
                    onClick={() => setActiveImage(imgUrl)}
                    className={`w-20 aspect-[3/4] rounded-sm overflow-hidden border-2 shrink-0 ${
                      activeImage === imgUrl ? 'border-[#0A264A]' : 'border-[#E4DDD0]'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`${product.name} thumbnail ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 text-xs text-[#6D7380]">
              <a
                href={pinterestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[#4A505C] hover:text-[#0A264A] font-medium"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Save Edition to Pinterest</span>
              </a>
              <a
                href="https://www.pinterest.com/jeneconkglobal/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                @jeneconkglobal
              </a>
            </div>
          </div>

          {/* Right: Contiguous Purchase Module */}
          <div className="lg:col-span-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#6D7380]">
                <span className="text-[#B88329] font-medium">
                  {category?.name || 'Digital Resource'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[#171A21]">{product.fileFormat}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">v{product.version}</span>
              </div>

              <h1 className="mt-2.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21] leading-tight">
                {product.name}
              </h1>

              <p className="mt-3.5 text-base sm:text-lg text-[#4A505C] leading-relaxed">
                {product.shortBenefit}
              </p>
            </div>

            {/* Pricing & Checkout Box */}
            <div className="bg-white border border-[#D5CCB9] rounded-sm p-6 space-y-5">
              <div className="flex items-baseline justify-between gap-4 pb-4 border-b border-[#EDE7DA]">
                <div>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[#6D7380] block">
                    {product.isFree
                      ? 'Edition Access'
                      : price.isConfigured
                      ? `Price (${currency})`
                      : 'Marketplace Checkout'}
                  </span>
                  <div className="mt-1 flex items-baseline gap-2.5">
                    {!price.isConfigured && selarHref ? (
                      <a
                        href={selarHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={trackSelarClick}
                        className="inline-flex items-center gap-1.5 font-display text-xl sm:text-2xl font-semibold text-[#0A264A] hover:text-[#B88329] transition-colors"
                      >
                        <span>View current price on Selar</span>
                        <ArrowUpRight className="w-4 h-4 shrink-0" />
                      </a>
                    ) : (
                      <span className="font-mono text-2xl font-bold text-[#171A21] tabular-nums">
                        {price.current}
                      </span>
                    )}
                    {price.original && (
                      <span className="font-mono text-sm text-[#6D7380] line-through tabular-nums">
                        {price.original}
                      </span>
                    )}
                  </div>
                  {!price.isConfigured && selarHref && !product.isFree && (
                    <p className="mt-1.5 text-xs text-[#6D7380]">
                      Live pricing in NGN and international currencies is shown directly on Selar.
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-[#6D7380] shrink-0 font-mono">
                  <div>{product.fileSize || product.fileFormat}</div>
                  <div>Digital Edition</div>
                </div>
              </div>

              {product.isFree && selarHref && !product.hasProtectedFile ? (
                <div className="space-y-3">
                  <a
                    href={selarHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      trackSelarClick();
                      trackEvent({
                        eventType: 'free_resource_download',
                        productId: product.id,
                        productSlug: product.slug,
                      });
                    }}
                    className="w-full py-3.5 px-6 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm inline-flex items-center justify-center gap-2 transition-colors min-h-[48px]"
                  >
                    <span>Get Free Resource on Selar</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                  <p className="text-xs text-[#6D7380] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 shrink-0 text-[#B88329]" />
                    <span>
                      Free digital download fulfilled directly via our official Selar page.
                    </span>
                  </p>
                </div>
              ) : product.isFree ? (
                <form onSubmit={handleFreeUnlock} className="space-y-3">
                  <label className="block text-xs font-medium text-[#4A505C]">
                    Enter your email to receive your protected download link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      value={freeEmail}
                      onChange={(e) => setFreeEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="flex-1 px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                    />
                    <button
                      type="submit"
                      disabled={freeSubmitting}
                      className="px-5 py-2.5 text-xs uppercase tracking-[0.12em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm whitespace-nowrap disabled:opacity-60"
                    >
                      {freeSubmitting ? 'Generating...' : 'Get Link'}
                    </button>
                  </div>
                  {freeStatus && <p className="text-xs text-[#4A505C]">{freeStatus}</p>}
                  {freeDownloadUrl && (
                    <a
                      href={freeDownloadUrl}
                      target={freeDownloadUrl.startsWith('https://') ? '_blank' : undefined}
                      rel={freeDownloadUrl.startsWith('https://') ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-sm"
                    >
                      <span>
                        {freeDownloadUrl.startsWith('https://')
                          ? 'Continue to Selar'
                          : `Download ${product.name} Now`}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </form>
              ) : canUseNative ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    className="w-full py-3.5 px-6 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm inline-flex items-center justify-center gap-2 transition-colors min-h-[48px]"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Add to Bag — Native Paystack Checkout</span>
                  </button>
                  {selarHref && (
                    <a
                      href={selarHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={trackSelarClick}
                      className="w-full py-2.5 px-4 text-xs font-medium text-[#171A21] bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm inline-flex items-center justify-center gap-1.5"
                    >
                      <span>Or Purchase via Selar</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ) : selarHref ? (
                <div className="space-y-3">
                  <a
                    href={selarHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={trackSelarClick}
                    className="w-full py-3.5 px-6 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm inline-flex items-center justify-center gap-2 transition-colors min-h-[48px]"
                  >
                    <span>Buy Now on Selar</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                  <p className="text-xs text-[#6D7380] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 shrink-0 text-[#B88329]" />
                    <span>
                      Checkout and instant file delivery are processed securely on Selar.
                    </span>
                  </p>
                </div>
              ) : (
                <div className="bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm p-4 space-y-3">
                  <p className="text-sm font-semibold text-[#171A21]">
                    Checkout Link Updating Soon
                  </p>
                  <p className="text-xs text-[#4A505C] leading-relaxed">
                    This edition is currently being linked to its verified checkout channel. Request direct purchase assistance below and our team will reply promptly.
                  </p>
                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/contact?product=${encodeURIComponent(product.slug)}`)
                      }
                      className="px-4 py-2 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm"
                    >
                      Request Purchase Link
                    </button>
                    {profile?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        className="text-xs font-semibold text-[#0A264A] hover:underline"
                      >
                        Configure Selar URL &amp; Price in Admin
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Key Benefits */}
            {product.keyBenefits.length > 0 && (
              <div className="pt-2">
                <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#B88329] mb-3">
                  Key Outcomes
                </h2>
                <ul className="space-y-2.5">
                  {product.keyBenefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#4A505C]">
                      <Check className="w-4 h-4 text-[#0A264A] shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Contextual Jeneconk Ecosystem Recommendations */}
            {((product.ecosystemName && product.ecosystemUrl) ||
              contextualPlatforms.length > 0) && (
              <div className="border border-[#D5CCB9] rounded-sm p-5 bg-[#F3EEE4]/70 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[#B88329]">
                  Jeneconk Ecosystem Companion
                </p>

                {product.ecosystemName && product.ecosystemUrl && (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display text-base font-semibold text-[#171A21]">
                        {product.ecosystemName}
                      </h3>
                      <p className="mt-1 text-xs text-[#4A505C] leading-relaxed">
                        {product.ecosystemPitch ||
                          `Explore ${product.ecosystemName} from the Jeneconk platform ecosystem.`}
                      </p>
                    </div>
                    <a
                      href={product.ecosystemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-[#0A264A] bg-white border border-[#D5CCB9] hover:bg-[#FAF8F4] rounded-sm whitespace-nowrap shrink-0"
                    >
                      <span>Explore</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                {contextualPlatforms.length > 0 && (
                  <div
                    className={`space-y-2.5 ${
                      product.ecosystemName && product.ecosystemUrl
                        ? 'pt-3 border-t border-[#D5CCB9]/80'
                        : ''
                    }`}
                  >
                    {contextualPlatforms.map((pl) => (
                      <div
                        key={pl.id}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 bg-white border border-[#D5CCB9] rounded-sm flex items-center justify-center text-[#0A264A] shrink-0">
                            <EcosystemIcon
                              iconName={pl.iconName}
                              logoUrl={pl.logoUrl}
                              name={pl.name}
                              className="w-3.5 h-3.5"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#171A21] truncate">
                              {pl.name}
                            </p>
                            <p className="text-[#4A505C] truncate">{pl.description}</p>
                          </div>
                        </div>
                        {pl.destinationUrl ? (
                          <a
                            href={pl.destinationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#0A264A] hover:text-[#B88329] whitespace-nowrap shrink-0"
                          >
                            <span>Explore</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/contact?platform=${encodeURIComponent(pl.name)}`)
                            }
                            className="font-semibold text-[#0A264A] hover:text-[#B88329] whitespace-nowrap shrink-0"
                          >
                            Enquire
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Detailed Sales Information */}
        <div className="mt-16 pt-12 border-t border-[#E4DDD0] grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-7 space-y-10">
            <section>
              <h2 className="font-display text-2xl font-semibold text-[#171A21] mb-4">
                Edition Overview
              </h2>
              <div className="space-y-4 text-base text-[#4A505C] leading-relaxed whitespace-pre-line">
                {product.fullDescription}
              </div>
            </section>

            {product.contentsList.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-semibold text-[#171A21] mb-4">
                  What Is Included
                </h2>
                <ul className="space-y-2.5 text-sm text-[#171A21]">
                  {product.contentsList.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 p-4 bg-white border border-[#E4DDD0] rounded-sm"
                    >
                      <span className="font-mono text-xs text-[#B88329] font-semibold mt-0.5">
                        0{idx + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {product.intendedAudience.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-semibold text-[#171A21] mb-4">
                  Who Should Use It
                </h2>
                <ul className="space-y-2 text-sm text-[#4A505C] list-disc pl-5">
                  {product.intendedAudience.map((aud, i) => (
                    <li key={i}>{aud}</li>
                  ))}
                </ul>
              </section>
            )}

            {product.instructions && (
              <section>
                <h2 className="font-display text-xl font-semibold text-[#171A21] mb-3">
                  How It Works
                </h2>
                <p className="text-sm sm:text-base text-[#4A505C] leading-relaxed">
                  {product.instructions}
                </p>
              </section>
            )}
          </div>

          <div className="lg:col-span-5 space-y-8">
            <section className="bg-white border border-[#D5CCB9] rounded-sm p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold text-[#171A21]">
                Specifications &amp; Licence
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4 pb-2.5 border-b border-[#EDE7DA]">
                  <dt className="text-[#6D7380]">File Format</dt>
                  <dd className="font-mono font-medium text-[#171A21]">{product.fileFormat}</dd>
                </div>
                <div className="flex justify-between gap-4 pb-2.5 border-b border-[#EDE7DA]">
                  <dt className="text-[#6D7380]">Version</dt>
                  <dd className="font-mono font-medium text-[#171A21]">{product.version}</dd>
                </div>
                {product.fileSize && (
                  <div className="flex justify-between gap-4 pb-2.5 border-b border-[#EDE7DA]">
                    <dt className="text-[#6D7380]">File Size</dt>
                    <dd className="font-mono font-medium text-[#171A21]">{product.fileSize}</dd>
                  </div>
                )}
                {product.requirements && (
                  <div className="pb-2.5 border-b border-[#EDE7DA]">
                    <dt className="text-[#6D7380] mb-1">Software / Device Requirements</dt>
                    <dd className="text-[#4A505C] leading-relaxed">{product.requirements}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-[#6D7380] mb-1">Product Licence</dt>
                  <dd className="text-[#4A505C] leading-relaxed">{product.licenceType}</dd>
                </div>
              </dl>
            </section>

            {product.faqs.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-semibold text-[#171A21] mb-4">
                  Frequently Asked Questions
                </h2>
                <div className="space-y-2.5">
                  {product.faqs.map((faq, idx) => {
                    const isOpen = openFaq === idx;
                    return (
                      <div
                        key={idx}
                        className="border border-[#E4DDD0] rounded-sm overflow-hidden bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenFaq(isOpen ? null : idx)}
                          className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 text-sm font-semibold text-[#171A21] hover:bg-[#FAF8F4]"
                        >
                          <span>{faq.question}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-[#6D7380] shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[#6D7380] shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 text-sm text-[#4A505C] leading-relaxed border-t border-[#EDE7DA] pt-3">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <section className="mt-16 pt-12 border-t border-[#E4DDD0]">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#171A21] mb-8">
              Related Digital Editions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {related.map((rp) => (
                <ProductCard
                  key={rp.id}
                  product={rp}
                  categoryName={
                    rp.categoryId
                      ? categories.find((c) => c.id === rp.categoryId)?.name
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Compact Mobile Sticky Checkout Bar (under 15% viewport height) */}
      {selarHref && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-[#FAF8F4]/95 backdrop-blur-md border-t border-[#D5CCB9] px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display font-semibold text-sm text-[#171A21] truncate">
              {product.name}
            </p>
            <p className="text-[11px] font-mono text-[#6D7380]">
              {product.isFree
                ? 'Free Download'
                : price.isConfigured
                ? price.current
                : 'Via Selar'}
            </p>
          </div>
          <a
            href={selarHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={trackSelarClick}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] rounded-sm whitespace-nowrap shrink-0"
          >
            <span>{product.isFree ? 'Get Free' : 'Buy on Selar'}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
