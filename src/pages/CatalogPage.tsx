import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { SeoHead } from '../components/SeoHead';
import { useStore } from '../context/StoreContext';
import { formatMinorPrice } from '../lib/format';

interface CatalogPageProps {
  mode:
    | 'shop'
    | 'categories'
    | 'category-detail'
    | 'bundles'
    | 'free-resources'
    | 'new-arrivals'
    | 'bestsellers';
  categorySlug?: string;
}

export function CatalogPage({ mode, categorySlug }: CatalogPageProps) {
  const {
    categories,
    products,
    bundles,
    collections,
    currency,
    navigate,
    currentPath,
    trackEvent,
    loadingStore,
    storeError,
    refreshStorefront,
  } = useStore();

  const { initialQuery, collectionSlug } = useMemo(() => {
    const idx = currentPath.indexOf('?');
    if (idx === -1) return { initialQuery: '', collectionSlug: '' };
    const params = new URLSearchParams(currentPath.slice(idx));
    return {
      initialQuery: params.get('search') || '',
      collectionSlug: params.get('collection') || '',
    };
  }, [currentPath]);

  const [search, setSearch] = useState(initialQuery);
  const [selectedCat, setSelectedCat] = useState<string>(categorySlug || 'all');
  const [selectedFormat, setSelectedFormat] = useState<string>('ALL');

  useEffect(() => {
    setSearch(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (categorySlug) {
      setSelectedCat(categorySlug);
      trackEvent({ eventType: 'category_view', categorySlug });
    } else {
      setSelectedCat('all');
    }
  }, [categorySlug, trackEvent]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const populatedCategories = useMemo(
    () =>
      categories.filter((cat) =>
        products.some((p) => p.categoryId === cat.id)
      ),
    [categories, products]
  );
  const activeCategory = categories.find((c) => c.slug === selectedCat);
  const activeCollection = collectionSlug
    ? collections.find((c) => c.slug === collectionSlug)
    : undefined;

  const availableFormats = useMemo(() => {
    const defaults = ['PDF', 'XLSX', 'DOCX', 'PPTX', 'ZIP'];
    const dynamic = products.map((p) => p.fileFormat.toUpperCase());
    return Array.from(new Set([...defaults, ...dynamic]));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (mode === 'free-resources' && !p.isFree) return false;
      if (mode === 'new-arrivals' && !p.isNewArrival) return false;
      if (mode === 'bestsellers' && !(p.isBestseller && p.verifiedSalesCount > 0)) {
        return false;
      }
      if (activeCollection) {
        const ids = new Set(activeCollection.productIds || []);
        if (!ids.has(p.id)) return false;
      }
      if (selectedCat !== 'all') {
        const cat = p.categoryId ? categoryById.get(p.categoryId) : null;
        if (!cat || cat.slug !== selectedCat) return false;
      }
      if (selectedFormat !== 'ALL' && p.fileFormat.toUpperCase() !== selectedFormat) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${p.name} ${p.shortBenefit} ${p.shortDescription} ${p.fileFormat}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, mode, activeCollection, selectedCat, selectedFormat, search, categoryById]);

  const pageMeta = {
    shop: {
      title: 'Shop All Digital Products | Jeneconk Digital Store',
      heading: 'All Digital Editions',
      subtitle:
        'Browse planners, Excel and Google Sheets templates, toolkits, e-books, AI prompt systems, and Canva resources.',
    },
    categories: {
      title: 'Product Departments | Jeneconk Digital Store',
      heading: 'Product Collections & Departments',
      subtitle:
        'Explore our six specialised digital product departments across personal growth, business, education, marketing, AI, and design.',
    },
    'category-detail': {
      title: `${activeCategory?.name || 'Department'} | Jeneconk Digital Store`,
      heading: activeCategory?.name || 'Department Catalog',
      subtitle: activeCategory?.description || 'Browse resources in this department.',
    },
    bundles: {
      title: 'Digital Product Bundles | Jeneconk Digital Store',
      heading: 'Digital Resource Bundles',
      subtitle:
        'Curated multi-product collections offering coordinated workflows and bundle savings.',
    },
    'free-resources': {
      title: 'Free Digital Resources | Jeneconk Digital Store',
      heading: 'Free Resources & Starter Guides',
      subtitle:
        'Access complimentary starter checklists, planners, and guides curated by Jeneconk Digital Store.',
    },
    'new-arrivals': {
      title: 'New Arrivals | Jeneconk Digital Store',
      heading: 'New Arrivals',
      subtitle: 'Recently published digital workbooks, templates, and toolkits.',
    },
    bestsellers: {
      title: 'Verified Bestsellers | Jeneconk Digital Store',
      heading: 'Verified Bestsellers',
      subtitle:
        'Top-performing digital products backed strictly by verified order records.',
    },
  }[mode];

  if (mode === 'categories') {
    return (
      <div className="py-12 sm:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SeoHead
          title={pageMeta.title}
          description={pageMeta.subtitle}
          path="/categories"
        />
        <div className="mb-10 pb-8 border-b border-[#E4DDD0]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
            Store Directory
          </p>
          <h1 className="mt-1.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
            {pageMeta.heading}
          </h1>
          <p className="mt-2.5 text-base text-[#4A505C] max-w-2xl">
            Browse our active digital resource departments with published editions ready for immediate download.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
          {populatedCategories.map((cat, idx) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return (
              <div
                key={cat.id}
                className="bg-white border border-[#E4DDD0] hover:border-[#C5BA9F] rounded-sm p-7 flex flex-col justify-between transition-colors"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-mono text-xs text-[#B88329]">
                      0{idx + 1}
                    </span>
                    <span className="font-mono text-xs text-[#6D7380] tabular-nums shrink-0">
                      {count} edition{count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-[#171A21]">
                    {cat.name}
                  </h2>
                  <p className="mt-2.5 text-sm text-[#4A505C] leading-relaxed">
                    {cat.description}
                  </p>
                  {cat.subtopics.length > 0 && (
                    <p className="mt-4 text-xs text-[#6D7380] leading-relaxed">
                      Topics: {cat.subtopics.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-[#EDE7DA] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(`/categories/${cat.slug}`)}
                    className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#0A264A] hover:text-[#B88329]"
                  >
                    <span>Browse Department</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  {cat.ecosystemApp && cat.ecosystemUrl && (
                    <a
                      href={cat.ecosystemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#6D7380] hover:text-[#171A21]"
                    >
                      <span>Related: {cat.ecosystemApp}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'bundles') {
    return (
      <div className="py-12 sm:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SeoHead title={pageMeta.title} description={pageMeta.subtitle} path="/bundles" />
        <div className="mb-10 pb-8 border-b border-[#E4DDD0]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
            Coordinated Toolkits
          </p>
          <h1 className="mt-1.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
            {pageMeta.heading}
          </h1>
          <p className="mt-2.5 text-base text-[#4A505C] max-w-2xl">
            {pageMeta.subtitle}
          </p>
        </div>

        {bundles.length === 0 ? (
          <div className="bg-white border border-[#E4DDD0] rounded-sm p-10 text-center max-w-2xl mx-auto">
            <h2 className="font-display text-xl font-semibold text-[#171A21]">
              Digital Bundles Coming Soon
            </h2>
            <p className="mt-2.5 text-sm text-[#4A505C] leading-relaxed">
              Coordinated multi-resource bundles are currently being prepared. Meanwhile, all individual planners, guides, and toolkits are available in our catalog.
            </p>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="mt-6 px-6 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm"
            >
              Browse Digital Editions
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
            {bundles.map((bundle) => {
              const minor =
                currency === 'NGN' ? bundle.priceNgnKobo : bundle.priceUsdCents;
              const priceLabel = formatMinorPrice(minor, currency);
              return (
                <div
                  key={bundle.id}
                  className="bg-white border border-[#E4DDD0] rounded-sm p-7 flex flex-col justify-between"
                >
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-[#171A21]">
                      {bundle.name}
                    </h2>
                    <p className="mt-2 text-sm text-[#4A505C] leading-relaxed">
                      {bundle.description}
                    </p>
                    {bundle.products && bundle.products.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-[#EDE7DA]">
                        <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#6D7380] mb-2">
                          Included Resources
                        </p>
                        <ul className="space-y-1.5 text-sm text-[#171A21]">
                          {bundle.products.map((bp) => (
                            <li key={bp.id}>
                              <button
                                type="button"
                                onClick={() => navigate(`/products/${bp.slug}`)}
                                className="hover:text-[#0A264A] hover:underline"
                              >
                                {bp.name} ({bp.fileFormat})
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#EDE7DA] flex items-center justify-between gap-4">
                    <span className="font-mono text-base font-semibold text-[#171A21] tabular-nums">
                      {priceLabel || 'View current price on Selar'}
                    </span>
                    {bundle.marketplaceUrl ? (
                      <a
                        href={bundle.marketplaceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm"
                      >
                        <span>Buy Bundle</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-[#6D7380]">
                        Checkout link pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-12 sm:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <SeoHead
        title={pageMeta.title}
        description={pageMeta.subtitle}
        path={currentPath.split('?')[0]}
      />

      <div className="mb-8 pb-6 border-b border-[#E4DDD0]">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
          Jeneconk Catalog
        </p>
        <h1 className="mt-1.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
          {pageMeta.heading}
        </h1>
        <p className="mt-2 text-base text-[#4A505C] max-w-2xl">
          {pageMeta.subtitle}
        </p>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-[#E4DDD0] rounded-sm p-5 mb-9 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6D7380] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search digital editions by title, topic, or format..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0A264A]"
            />
          </div>

          <select
            aria-label="Filter by file format"
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0A264A]"
          >
            <option value="ALL">All Formats</option>
            {availableFormats.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCat('all')}
            className={`px-3.5 py-2 text-xs font-medium rounded-sm whitespace-nowrap shrink-0 transition-colors border ${
              selectedCat === 'all'
                ? 'bg-[#0A264A] text-[#FAF8F4] border-[#0A264A]'
                : 'bg-[#FAF8F4] text-[#4A505C] border-[#E4DDD0] hover:border-[#0A264A]'
            }`}
          >
            All Departments
          </button>
          {populatedCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCat(cat.slug)}
              className={`px-3.5 py-2 text-xs font-medium rounded-sm whitespace-nowrap shrink-0 transition-colors border ${
                selectedCat === cat.slug
                  ? 'bg-[#0A264A] text-[#FAF8F4] border-[#0A264A]'
                  : 'bg-[#FAF8F4] text-[#4A505C] border-[#E4DDD0] hover:border-[#0A264A]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {activeCollection && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#EDE7DA] text-xs text-[#4A505C]">
            <span>
              Filtering by collection:{' '}
              <strong className="text-[#171A21]">{activeCollection.title}</strong>
            </span>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="text-[#0A264A] font-semibold hover:text-[#B88329]"
            >
              Clear Collection Filter
            </button>
          </div>
        )}
      </div>

      {storeError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-sm p-8 text-center space-y-3">
          <p className="text-sm font-medium text-rose-800">{storeError}</p>
          <button
            type="button"
            onClick={refreshStorefront}
            className="px-5 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-sm"
          >
            Retry Loading Catalog
          </button>
        </div>
      ) : loadingStore && products.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-[460px] bg-white border border-[#E4DDD0] rounded-sm animate-pulse"
            />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white border border-[#E4DDD0] rounded-sm p-10 text-center space-y-3">
          <h2 className="font-display text-xl font-semibold text-[#171A21]">
            {activeCategory && !search.trim() && selectedFormat === 'ALL'
              ? `${activeCategory.name} — Upcoming Department`
              : mode === 'bestsellers'
              ? 'Featured Bestsellers Coming Soon'
              : 'No Matching Digital Editions Found'}
          </h2>
          <p className="text-sm text-[#4A505C] max-w-lg mx-auto leading-relaxed">
            {activeCategory && !search.trim() && selectedFormat === 'ALL'
              ? `New digital resources for ${activeCategory.name} are currently being prepared${
                  activeCategory.subtopics.length > 0
                    ? ` (including ${activeCategory.subtopics.slice(0, 3).join(', ')})`
                    : ''
                }. Browse our currently available editions or contact us for bespoke institutional enquiries.`
              : mode === 'bestsellers'
              ? 'Popular customer favourites will appear here as store orders grow. Explore all available editions below.'
              : mode === 'free-resources'
              ? 'Complimentary starter guides and templates will appear here as new free editions are released.'
              : 'Try adjusting your department filter, format selection, or search keywords.'}
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedCat('all');
                setSelectedFormat('ALL');
                if (mode !== 'shop' || activeCollection) navigate('/shop');
              }}
              className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm"
            >
              View All Published Editions
            </button>
            {activeCategory && !search.trim() && (
              <button
                type="button"
                onClick={() => navigate('/contact')}
                className="px-5 py-2.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#171A21] bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm"
              >
                Request a Resource
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
          {filteredProducts.map((product) => (
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
  );
}
