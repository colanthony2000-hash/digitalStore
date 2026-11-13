import { ArrowRight, ArrowUpRight, Compass } from 'lucide-react';
import { EcosystemIcon } from '../components/EcosystemIcon';
import { SeoHead } from '../components/SeoHead';
import { useStore } from '../context/StoreContext';

const ECOSYSTEM_SECTOR_ORDER = [
  'Education & Learning',
  'Business & Finance',
  'Marketing & Growth',
  'Training & Professional Development',
];

export function EcosystemPage() {
  const { ecosystemPlatforms, loadingStore, navigate } = useStore();

  const groupedSectors = Array.from(
    new Set([
      ...ECOSYSTEM_SECTOR_ORDER,
      ...ecosystemPlatforms.map((p) => p.category),
    ])
  )
    .map((sector) => ({
      sector,
      items: ecosystemPlatforms.filter((p) => p.category === sector),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="bg-[#FAF8F4] py-12 sm:py-16">
      <SeoHead
        title="Jeneconk Digital Ecosystem | Platforms & Software Solutions"
        description="Explore practical software platforms and digital solutions developed by Jeneconk Integrated Global Solutions Limited for education, business, finance, marketing, and training."
        path="/ecosystem"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="pb-8 border-b border-[#E4DDD0] flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
              Jeneconk Digital Ecosystem
            </p>
            <h1 className="mt-1.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21] leading-tight">
              Platforms Built Beyond Our Digital Store
            </h1>
            <p className="mt-3 text-base text-[#4A505C] leading-relaxed">
              While Jeneconk Digital Store focuses on downloadable workbooks, guides, and templates, Jeneconk Integrated Global Solutions Limited also develops specialised software platforms for schools, businesses, marketers, and learners.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="inline-flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm whitespace-nowrap shrink-0 self-start lg:self-auto min-h-[44px]"
          >
            <span>Shop Downloadable Products</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loadingStore && ecosystemPlatforms.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-52 bg-white border border-[#E4DDD0] rounded-sm animate-pulse"
              />
            ))}
          </div>
        ) : ecosystemPlatforms.length === 0 ? (
          <div className="bg-white border border-[#E4DDD0] rounded-sm p-10 text-center max-w-2xl mx-auto space-y-4">
            <Compass className="w-8 h-8 text-[#B88329] mx-auto" strokeWidth={1.5} />
            <h2 className="font-display text-xl font-semibold text-[#171A21]">
              Platform Directory Updating
            </h2>
            <p className="text-sm text-[#4A505C] leading-relaxed">
              Our software platform listings are currently being updated. Explore our downloadable planners, manuals, and templates in the store below.
            </p>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm"
            >
              Browse Digital Store
            </button>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedSectors.map(({ sector, items }) => (
              <section key={sector} className="space-y-5">
                <div className="flex items-baseline justify-between gap-4 border-b border-[#E4DDD0] pb-3">
                  <h2 className="font-display text-2xl font-semibold text-[#171A21]">
                    {sector}
                  </h2>
                  <span className="text-xs font-mono text-[#6D7380] tabular-nums">
                    {items.length} solution{items.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map((platform) => (
                    <article
                      key={platform.id}
                      className="bg-white border border-[#E4DDD0] hover:border-[#C5BA9F] rounded-sm p-6 flex flex-col justify-between transition-colors"
                    >
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="w-10 h-10 bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm flex items-center justify-center text-[#0A264A] shrink-0">
                            <EcosystemIcon
                              iconName={platform.iconName}
                              logoUrl={platform.logoUrl}
                              name={platform.name}
                              className="w-5 h-5"
                            />
                          </div>
                          <span className="text-[11px] uppercase tracking-[0.12em] text-[#B88329] font-medium truncate">
                            {platform.category}
                          </span>
                        </div>

                        <h3 className="font-display text-xl font-semibold text-[#171A21]">
                          {platform.name}
                        </h3>

                        <p className="text-sm text-[#4A505C] leading-relaxed">
                          {platform.description}
                        </p>
                      </div>

                      <div className="mt-6 pt-4 border-t border-[#EDE7DA] flex items-center justify-between gap-3">
                        {platform.destinationUrl ? (
                          <a
                            href={platform.destinationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#0A264A] hover:text-[#B88329] transition-colors"
                          >
                            <span>Explore Product</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/contact?platform=${encodeURIComponent(platform.name)}`
                              )
                            }
                            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#0A264A] hover:text-[#B88329] transition-colors"
                          >
                            <span>Enquire for Setup</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {platform.relatedCategorySlug && (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/categories/${platform.relatedCategorySlug}`)
                            }
                            className="text-xs text-[#6D7380] hover:text-[#171A21] transition-colors"
                          >
                            Related Guides
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
