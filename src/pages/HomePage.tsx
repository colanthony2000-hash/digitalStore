import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { EcosystemIcon } from '../components/EcosystemIcon';
import { ProductCard } from '../components/ProductCard';
import { SeoHead } from '../components/SeoHead';
import { useStore } from '../context/StoreContext';
import { buildSelarCheckoutUrl } from '../lib/format';

const STORE_FAQS = [
  {
    q: 'How are downloadable products delivered after checkout?',
    a: 'All paid and free editions link directly to our verified Selar listings. Once checkout completes on Selar, your files are available for immediate download alongside a confirmation email.',
  },
  {
    q: 'What currencies and payment methods are supported?',
    a: 'Selar supports Nigerian Naira (NGN) cards, bank transfers, and USSD, as well as international card payments in USD and other global currencies.',
  },
  {
    q: 'Can I use planners and guides across phone, tablet, and print?',
    a: 'Yes. High-resolution PDF editions are formatted cleanly for tablet annotation apps (such as GoodNotes or Notability), desktop/phone readers, and standard A4 or Letter home printing.',
  },
  {
    q: 'What is included in my licence and refund protection?',
    a: 'Each edition specifies its exact licence terms (typically Single Personal or Educator Use). Defective files or accidental duplicate transactions qualify for prompt replacement or refund support via support@jeneconk.com.',
  },
];

export function HomePage() {
  const {
    categories,
    products,
    collections,
    ecosystemPlatforms,
    settings,
    navigate,
    loadingStore,
    storeError,
    refreshStorefront,
    trackEvent,
  } = useStore();

  const [heroSearch, setHeroSearch] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [subName, setSubName] = useState('');
  const [subStatus, setSubStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    downloadUrl?: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  // Only show categories that currently contain at least one published product
  const activeCategories = useMemo(
    () =>
      categories.filter((cat) =>
        products.some((p) => p.categoryId === cat.id)
      ),
    [categories, products]
  );

  const featuredProducts = products.filter((p) => p.isFeatured);
  const displayFeatured =
    featuredProducts.length > 0 ? featuredProducts.slice(0, 6) : products.slice(0, 6);
  const displayedIds = new Set(displayFeatured.map((p) => p.id));

  const heroSpotlightProduct =
    products.find((p) => p.slug === 'life-reset') || displayFeatured[0] || null;

  const bestsellers = products.filter(
    (p) => p.isBestseller && p.verifiedSalesCount > 0
  );

  // Recently added resources when distinct from the featured grid
  const additionalNewArrivals = products.filter(
    (p) => p.isNewArrival && !displayedIds.has(p.id)
  );

  const freeResources = products.filter((p) => p.isFree);
  const primaryFreeResource = freeResources[0] || null;
  const publishedCollections = collections.filter(
    (c) => (c.products?.length || 0) > 0
  );

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = heroSearch.trim();
    if (q) {
      trackEvent({ eventType: 'search' });
    }
    navigate(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop');
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubStatus(null);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: subEmail,
          fullName: subName,
          source: 'homepage',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubStatus({
          type: 'error',
          message: data.error || 'Subscription failed.',
        });
        return;
      }
      setSubEmail('');
      setSubName('');
      setSubStatus({
        type: 'success',
        message: data.message,
        downloadUrl: data.downloadUrl,
      });
    } catch {
      setSubStatus({
        type: 'error',
        message: 'Network error. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#FAF8F4]">
      <SeoHead
        title="Jeneconk Digital Store – Planners, Templates & Digital Toolkits"
        description="Discover practical digital planners, business spreadsheets, educational resources, and AI toolkits from Jeneconk Integrated Global Solutions Limited."
        path="/"
        image="/assets/images/hero_digital_products_1794558203570.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Store',
          name: 'Jeneconk Digital Store',
          url: window.location.origin,
          description:
            'Official digital products marketplace by Jeneconk Integrated Global Solutions Limited.',
          parentOrganization: {
            '@type': 'Organization',
            name: 'Jeneconk Integrated Global Solutions Limited',
            url: 'https://www.jeneconk.com',
          },
        }}
      />

      {storeError && (
        <div className="bg-rose-50 border-b border-rose-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-rose-800">
            <span>{storeError}</span>
            <button
              type="button"
              onClick={refreshStorefront}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-sm"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden border-b border-[#E4DDD0] bg-[#FAF8F4]">
        <div className="pointer-events-none absolute -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-[#E7DDC7]/30 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-2 lg:gap-16 lg:px-12 lg:py-20 xl:px-16">
          <div className="max-w-2xl space-y-6 lg:space-y-7">
            <div className="flex items-center gap-3">
              <span className="h-px w-9 bg-[#B88329]" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0A264A] sm:text-[11px]">
                {settings.heroKicker || 'Jeneconk Integrated Global Solutions'}
              </p>
            </div>

            <h1 className="max-w-[12ch] font-display text-[clamp(2.7rem,5.5vw,5.2rem)] font-medium leading-[0.98] tracking-[-0.045em] text-[#171A21]">
              Practical resources.{' '}
              <span className="font-normal italic text-[#0A264A]">Smarter work. Better living.</span>
            </h1>

            <p className="max-w-xl text-base leading-7 text-[#555B65] sm:text-lg sm:leading-8">
              Thoughtfully made planners, educator guides and practical workbooks to help you make meaningful progress at work, at home and in the classroom.
            </p>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => navigate('/shop')}
                className="inline-flex min-h-12 items-center justify-center gap-3 bg-[#0A264A] px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#061830] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B88329] focus-visible:ring-offset-2"
              >
                <span>Explore the store</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/free-resources')}
                className="inline-flex min-h-12 items-center justify-center border border-[#D5CCB9] bg-white/75 px-6 py-3.5 text-sm font-medium text-[#171A21] transition-colors hover:border-[#0A264A] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A264A] focus-visible:ring-offset-2"
              >
                Browse free resources
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#E4DDD0] pt-5 text-xs text-[#6D7380] sm:gap-x-7">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#B88329]" /> Secure checkout</span>
              <span className="inline-flex items-center gap-2"><Download className="h-4 w-4 text-[#B88329]" /> Instant digital access</span>
              <a href="https://www.jeneconk.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#0A264A] transition-colors hover:text-[#B88329]">
                jeneconk.com <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="mx-auto w-full max-w-xl lg:max-w-none">
            <div className="relative aspect-[1.12/1] overflow-hidden border border-[#D5CCB9] bg-[#F3EEE4] shadow-[0_32px_70px_-42px_rgba(10,26,48,0.5)] sm:aspect-[1.22/1]">
              <img
                src="/assets/images/hero_digital_products_1794558203570.jpg"
                alt="A calm, organised workspace with digital planning tools"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#071B36]/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white sm:p-7">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F0C66E]">Made for real life</p>
                <p className="mt-2 max-w-sm font-display text-2xl leading-tight sm:text-3xl">A little more clarity in every day.</p>
              </div>
              <span className="absolute right-4 top-4 border border-white/50 bg-[#FAF8F4]/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0A264A]">Digital editions</span>
            </div>

            {heroSpotlightProduct && (
              <button
                type="button"
                onClick={() => navigate(`/products/${heroSpotlightProduct.slug}`)}
                className="group mt-4 flex w-full items-center gap-4 border border-[#E4DDD0] bg-white p-3 text-left shadow-[0_14px_36px_-30px_rgba(10,26,48,0.55)] transition-all hover:border-[#C5BA9F] hover:shadow-[0_18px_42px_-28px_rgba(10,26,48,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A264A] sm:mt-5 sm:gap-5 sm:p-4"
              >
                <span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden border border-[#E4DDD0] bg-[#F3EEE4] sm:h-24 sm:w-[4.5rem]">
                  {heroSpotlightProduct.coverImage ? (
                    <img src={heroSpotlightProduct.coverImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-2 text-center font-display text-xs font-semibold leading-tight text-[#0A264A]">{heroSpotlightProduct.name}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B88329]">Featured edition</span>
                  <span className="mt-1 block truncate font-display text-base font-semibold text-[#171A21] sm:text-lg">{heroSpotlightProduct.name}</span>
                  <span className="mt-1 block text-xs text-[#6D7380]">Discover this resource <span aria-hidden="true">→</span></span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-[#0A264A] transition-transform group-hover:translate-x-1" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. PROMINENT SEARCH & PRODUCT DISCOVERY BAR */}
      <section className="bg-white border-b border-[#E4DDD0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <form
              onSubmit={handleHeroSearch}
              className="flex-1 flex items-center gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#6D7380] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  placeholder="Search planners, lesson note guides, spreadsheets, or free mini guides..."
                  aria-label="Search downloadable digital products"
                  className="w-full pl-10 pr-4 py-3 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0A264A]"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm whitespace-nowrap min-h-[44px] transition-colors"
              >
                Search Store
              </button>
            </form>

            {activeCategories.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                <span className="text-[11px] uppercase tracking-[0.12em] text-[#6D7380] whitespace-nowrap shrink-0">
                  Quick Browse:
                </span>
                {activeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => navigate(`/categories/${cat.slug}`)}
                    className="px-3 py-2 text-xs font-medium text-[#171A21] bg-[#FAF8F4] border border-[#E4DDD0] hover:border-[#0A264A] rounded-sm whitespace-nowrap shrink-0 transition-colors"
                  >
                    {cat.name}
                  </button>
                ))}
                {freeResources.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/free-resources')}
                    className="px-3 py-2 text-xs font-semibold text-[#0A264A] bg-[#F3EEE4] border border-[#D5CCB9] hover:border-[#0A264A] rounded-sm whitespace-nowrap shrink-0 transition-colors"
                  >
                    Free Guides
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. FEATURED DOWNLOADABLE PRODUCTS */}
      <section className="py-16 sm:py-20 bg-[#FAF8F4] border-b border-[#E4DDD0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
                Curated Catalog
              </p>
              <h2 className="mt-1.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
                Featured Digital Editions
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#4A505C] max-w-2xl">
                Ready-to-download planners, educator guides, and practical workbooks prepared for individuals, teachers, and organisations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0A264A] hover:text-[#B88329] whitespace-nowrap shrink-0 transition-colors"
            >
              <span>Browse Full Store</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {loadingStore ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-[460px] bg-white border border-[#E4DDD0] rounded-sm animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {displayFeatured.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categoryName={
                    product.categoryId
                      ? categoryById.get(product.categoryId)?.name
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. BROWSE BY CATEGORY (Only categories with published products shown to customers) */}
      {activeCategories.length > 0 && (
        <section className="py-16 sm:py-20 bg-white border-b border-[#E4DDD0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
                  Departments
                </p>
                <h2 className="mt-1.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
                  Browse by Category
                </h2>
                <p className="mt-2 text-sm sm:text-base text-[#4A505C] max-w-2xl">
                  Explore specialised collections organised around personal planning and classroom teaching excellence.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/categories')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0A264A] hover:text-[#B88329] whitespace-nowrap shrink-0 transition-colors"
              >
                <span>All Active Departments</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
              {activeCategories.map((cat, idx) => {
                const catProductCount = products.filter(
                  (p) => p.categoryId === cat.id
                ).length;
                return (
                  <div
                    key={cat.id}
                    className="group bg-[#FAF8F4] border border-[#E4DDD0] hover:border-[#C5BA9F] rounded-sm overflow-hidden flex flex-col justify-between transition-all duration-300"
                  >
                    <div>
                      <div className="aspect-[16/9] overflow-hidden bg-[#F3EEE4] border-b border-[#E4DDD0] relative">
                        {cat.imageUrl ? (
                          <img
                            src={cat.imageUrl}
                            alt={cat.name}
                            referrerPolicy="no-referrer"
                            className={`w-full h-full transition-transform duration-500 group-hover:scale-[1.03] ${
                              cat.imageUrl.startsWith('/assets/aistudio/') ||
                              cat.imageUrl.includes('_card_cover.')
                                ? 'object-contain p-2 bg-[#F3EEE4]'
                                : 'object-cover'
                            }`}
                          />
                        ) : (
                          <div className="w-full h-full bg-[#0A264A] flex items-center justify-center p-6 text-center">
                            <span className="font-display font-semibold text-[#FAF8F4] text-lg">
                              {cat.name}
                            </span>
                          </div>
                        )}
                        <div className="absolute top-3 left-3 bg-[#FAF8F4]/95 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[#0A264A] border border-[#D5CCB9] tabular-nums">
                          0{idx + 1} · {catProductCount} Edition
                          {catProductCount === 1 ? '' : 's'}
                        </div>
                      </div>

                      <div className="p-6">
                        <h3 className="font-display text-2xl font-semibold text-[#171A21]">
                          {cat.name}
                        </h3>
                        <p className="mt-2 text-sm text-[#4A505C] leading-relaxed">
                          {cat.description}
                        </p>
                      </div>
                    </div>

                    <div className="px-6 py-4 border-t border-[#E4DDD0] bg-white/70 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/categories/${cat.slug}`)}
                        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#0A264A] hover:text-[#B88329] transition-colors"
                      >
                        <span>Explore Collection</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      {cat.ecosystemApp && cat.ecosystemUrl && (
                        <a
                          href={cat.ecosystemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#6D7380] hover:text-[#171A21] transition-colors"
                        >
                          <span>Companion: {cat.ecosystemApp}</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 5. VERIFIED BESTSELLERS, RECENTLY ADDED & CURATED READING LISTS (conditional) */}
      {(bestsellers.length > 0 ||
        additionalNewArrivals.length > 0 ||
        publishedCollections.length > 0) && (
        <section className="py-16 bg-[#FAF8F4] border-b border-[#E4DDD0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
            {bestsellers.length > 0 && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
                      Customer Favourites
                    </p>
                    <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-[#171A21]">
                      Verified Bestsellers
                    </h2>
                    <p className="mt-1.5 text-sm text-[#4A505C]">
                      Popular digital editions backed by confirmed order records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/bestsellers')}
                    className="text-sm font-semibold text-[#0A264A] hover:text-[#B88329] whitespace-nowrap shrink-0"
                  >
                    View Bestsellers
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {bestsellers.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categoryName={
                        product.categoryId
                          ? categoryById.get(product.categoryId)?.name
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {additionalNewArrivals.length > 0 && (
              <div className={bestsellers.length > 0 ? 'pt-10 border-t border-[#E4DDD0]' : ''}>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
                      Latest Additions
                    </p>
                    <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-[#171A21]">
                      Recently Added Editions
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/new-arrivals')}
                    className="text-sm font-semibold text-[#0A264A] hover:text-[#B88329] whitespace-nowrap shrink-0"
                  >
                    View All New Arrivals
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {additionalNewArrivals.slice(0, 3).map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categoryName={
                        product.categoryId
                          ? categoryById.get(product.categoryId)?.name
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {publishedCollections.length > 0 && (
              <div
                className={
                  bestsellers.length > 0 || additionalNewArrivals.length > 0
                    ? 'pt-10 border-t border-[#E4DDD0]'
                    : ''
                }
              >
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#171A21] mb-2">
                  Curated Reading &amp; Resource Lists
                </h2>
                <p className="text-sm sm:text-base text-[#4A505C] mb-8 max-w-2xl">
                  Focused groupings organised for seasonal planning, classroom instruction, and structured goal execution.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {publishedCollections.map((col) => (
                    <div
                      key={col.id}
                      className="bg-white border border-[#E4DDD0] rounded-sm p-6 flex flex-col justify-between"
                    >
                      <div>
                        <h3 className="font-display text-lg font-semibold text-[#171A21]">
                          {col.title}
                        </h3>
                        <p className="mt-2 text-sm text-[#4A505C] leading-relaxed">
                          {col.subtitle}
                        </p>
                      </div>
                      <div className="mt-5 pt-4 border-t border-[#EDE7DA] flex items-center justify-between text-xs">
                        <span className="font-mono text-[#6D7380] tabular-nums">
                          {col.products?.length || 0} item(s) curated
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/shop?collection=${encodeURIComponent(col.slug)}`)
                          }
                          className="font-semibold text-[#0A264A] hover:text-[#B88329] inline-flex items-center gap-1"
                        >
                          <span>Open Collection</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 6. FREE RESOURCES PROMOTION & NEWSLETTER DISPATCH */}
      <section className="py-16 sm:py-18 bg-[#F3EEE4] border-b border-[#E4DDD0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white border border-[#D5CCB9] rounded-sm p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
                Complimentary Resource &amp; Updates
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#171A21]">
                {settings.freePromoHeadline || 'Starter Guides & Store Releases'}
              </h2>
              <p className="text-sm sm:text-base text-[#4A505C] leading-relaxed">
                {settings.freePromoSubtext ||
                  'Receive new digital edition announcements, complimentary starter guides, and seasonal planning kits directly from Jeneconk Digital Store.'}
              </p>

              {primaryFreeResource && (
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  {primaryFreeResource.marketplaceUrl ? (
                    <a
                      href={buildSelarCheckoutUrl(
                        primaryFreeResource.marketplaceUrl,
                        primaryFreeResource.slug,
                        'product_card'
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackEvent({
                          eventType: 'selar_outbound_click',
                          productId: primaryFreeResource.id,
                          productSlug: primaryFreeResource.slug,
                        })
                      }
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#0A264A] bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm transition-colors"
                    >
                      <span>Download Free: {primaryFreeResource.name}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => navigate('/free-resources')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A264A] hover:text-[#B88329] uppercase tracking-[0.12em]"
                  >
                    <span>View {freeResources.length} Free Edition(s)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleSubscribe} className="lg:col-span-6 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Full name (optional)"
                  className="px-4 py-3 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0A264A]"
                />
                <input
                  type="email"
                  required
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="px-4 py-3 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0A264A]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-7 py-3.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors disabled:opacity-60 min-h-[46px]"
              >
                {submitting ? 'Subscribing...' : 'Subscribe for New Releases'}
              </button>

              {subStatus && (
                <div
                  className={`text-sm p-3.5 rounded-sm border space-y-2 ${
                    subStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border-rose-200'
                  }`}
                >
                  <p>{subStatus.message}</p>
                  {subStatus.downloadUrl && (
                    <a
                      href={subStatus.downloadUrl}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Free Resource</span>
                    </a>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* 7. SECONDARY SECTION: EXPLORE THE JENECONK DIGITAL ECOSYSTEM */}
      {ecosystemPlatforms.length > 0 && (
        <section className="py-16 sm:py-20 bg-[#0D192B] text-[#FAF8F4] border-b border-[#1A2B45]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 pb-8 border-b border-[#1F3352]">
              <div className="max-w-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-[1px] bg-[#D4A146]" aria-hidden="true" />
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#D4A146] font-medium">
                    Secondary Software Directory
                  </p>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white">
                  Explore the Jeneconk Digital Ecosystem
                </h2>
                <p className="text-sm sm:text-base text-[#D7D2C8] leading-relaxed">
                  Beyond downloadable resources, discover practical digital solutions developed by Jeneconk to support education, business management, marketing and productivity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/ecosystem')}
                className="inline-flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] border border-[#2C456B] hover:border-[#D4A146] rounded-sm whitespace-nowrap shrink-0 self-start lg:self-auto transition-colors"
              >
                <span>Open Full Ecosystem Directory</span>
                <ArrowRight className="w-4 h-4 text-[#D4A146]" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ecosystemPlatforms.map((platform) => (
                <div
                  key={platform.id}
                  className="bg-[#13233B] border border-[#243958] hover:border-[#D4A146]/70 rounded-sm p-5 flex flex-col justify-between transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="w-8 h-8 rounded-sm bg-[#0D192B] border border-[#243958] flex items-center justify-center text-[#D4A146] shrink-0">
                        <EcosystemIcon
                          iconName={platform.iconName}
                          logoUrl={platform.logoUrl}
                          name={platform.name}
                          className="w-4 h-4"
                        />
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[#A9A69E] truncate">
                        {platform.category}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-semibold text-white">
                      {platform.name}
                    </h3>
                    <p className="text-xs text-[#D7D2C8]/90 leading-relaxed line-clamp-3">
                      {platform.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#1F3352] flex items-center justify-between gap-2">
                    {platform.destinationUrl ? (
                      <a
                        href={platform.destinationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4A146] hover:text-white transition-colors"
                      >
                        <span>Explore Product</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/contact?platform=${encodeURIComponent(platform.name)}`)
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FAF8F4]/90 hover:text-[#D4A146] transition-colors"
                      >
                        <span>Enquire for Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 8. TRUST GUARANTEES & STORE FAQS */}
      <section className="py-16 bg-[#FAF8F4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 pb-12 border-b border-[#E4DDD0]">
            <div className="flex items-start gap-3">
              <Layers className="w-4 h-4 text-[#B88329] shrink-0 mt-1" />
              <div>
                <h3 className="font-sans text-xs uppercase tracking-[0.12em] font-semibold text-[#171A21]">
                  Structured Formats
                </h3>
                <p className="mt-1 text-xs text-[#4A505C] leading-relaxed">
                  High-resolution PDFs, structured spreadsheets, and practical templates.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Download className="w-4 h-4 text-[#B88329] shrink-0 mt-1" />
              <div>
                <h3 className="font-sans text-xs uppercase tracking-[0.12em] font-semibold text-[#171A21]">
                  Immediate Fulfilment
                </h3>
                <p className="mt-1 text-xs text-[#4A505C] leading-relaxed">
                  Verified download access delivered immediately via Selar checkout.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-[#B88329] shrink-0 mt-1" />
              <div>
                <h3 className="font-sans text-xs uppercase tracking-[0.12em] font-semibold text-[#171A21]">
                  Global &amp; Local Ready
                </h3>
                <p className="mt-1 text-xs text-[#4A505C] leading-relaxed">
                  Built in Port Harcourt for individuals, schools, and teams worldwide.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#B88329] shrink-0 mt-1" />
              <div>
                <h3 className="font-sans text-xs uppercase tracking-[0.12em] font-semibold text-[#171A21]">
                  Transparent Licensing
                </h3>
                <p className="mt-1 text-xs text-[#4A505C] leading-relaxed">
                  Clear device requirements, version details, and consumer protection.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 space-y-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
                Helpful Answers
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#171A21]">
                Store &amp; Download FAQs
              </h2>
              <p className="text-sm text-[#4A505C] leading-relaxed">
                Everything you need to know before downloading your digital planner, manual, or starter guide.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/contact')}
                  className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#0A264A] hover:text-[#B88329]"
                >
                  <span>Contact Support Desk</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-2.5">
              {STORE_FAQS.map((item, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div
                    key={item.q}
                    className="bg-white border border-[#E4DDD0] rounded-sm overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 text-sm font-semibold text-[#171A21] hover:bg-[#FAF8F4]/70"
                    >
                      <span>{item.q}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#6D7380] shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#6D7380] shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 pt-3 text-sm text-[#4A505C] leading-relaxed border-t border-[#EDE7DA]">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
