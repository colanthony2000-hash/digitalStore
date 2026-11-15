import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const linkClass =
  'inline-flex min-h-8 items-center text-left text-sm leading-6 text-[#C0C4CC] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A146]';

export function Footer() {
  const { categories, products, bundles, ecosystemPlatforms, navigate, settings } =
    useStore();
  const [logoFailed, setLogoFailed] = useState(false);
  const activeCategories = categories.filter((category) =>
    products.some((product) => product.categoryId === category.id)
  );

  return (
    <footer className="bg-[#091526] text-[#D7D2C8]">
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12 xl:px-16">
        <div className="flex flex-col gap-5 border-b border-white/10 py-8 sm:flex-row sm:items-center sm:justify-between sm:py-9">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4A146]">A more intentional everyday</p>
            <p className="mt-2 font-display text-xl text-white sm:text-2xl">Practical resources. Better days.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-[#D4A146] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A146] sm:self-auto"
          >
            Explore the store <ArrowUpRight className="h-4 w-4 text-[#D4A146]" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-10 py-10 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:grid-cols-12 lg:gap-10 lg:py-14">
          <div className="space-y-5 sm:col-span-2 lg:col-span-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A146]"
              aria-label="Jeneconk Digital Store home"
            >
              {!logoFailed ? (
                <img
                  src="/assets/aistudio/logo_bf2c43a3.png"
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="h-11 w-11 shrink-0 rounded-full object-contain ring-1 ring-[#D4A146]/50"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A264A] font-display text-lg font-bold text-white ring-1 ring-[#D4A146]/50">J</span>
              )}
              <span>
                <span className="block font-display text-lg font-semibold text-white">Jeneconk</span>
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-[#D4A146]">Digital Store</span>
              </span>
            </button>

            <p className="max-w-sm text-sm leading-7 text-[#A9AEB8]">
              Thoughtful digital tools for planning, learning and getting more from everyday life. Operated by Jeneconk Integrated Global Solutions Limited in Port Harcourt, Nigeria.
            </p>

            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a href="https://www.jeneconk.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
                Jeneconk.com <ArrowUpRight className="ml-1 h-3 w-3 text-[#D4A146]" />
              </a>
              <a href="https://www.pinterest.com/jeneconkglobal/" target="_blank" rel="noopener noreferrer" className={linkClass}>
                Pinterest <ArrowUpRight className="ml-1 h-3 w-3 text-[#D4A146]" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-3">
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4A146]">Browse</h2>
            <ul className="space-y-1">
              {activeCategories.slice(0, 5).map((category) => (
                <li key={category.id}>
                  <button type="button" onClick={() => navigate(`/categories/${category.slug}`)} className={linkClass}>
                    {category.name}
                  </button>
                </li>
              ))}
              <li><button type="button" onClick={() => navigate('/shop')} className={`${linkClass} font-medium text-white`}>Shop all editions</button></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4A146]">Discover</h2>
            <ul className="space-y-1">
              <li><button type="button" onClick={() => navigate('/free-resources')} className={linkClass}>Free resources</button></li>
              {bundles.length > 0 && <li><button type="button" onClick={() => navigate('/bundles')} className={linkClass}>Digital bundles</button></li>}
              <li><button type="button" onClick={() => navigate('/ecosystem')} className={linkClass}>Our platforms</button></li>
              <li><button type="button" onClick={() => navigate('/about')} className={linkClass}>About Jeneconk</button></li>
              <li><button type="button" onClick={() => navigate('/contact')} className={linkClass}>Contact</button></li>
              {ecosystemPlatforms.find((platform) => platform.destinationUrl) && (
                <li>
                  <a href={ecosystemPlatforms.find((platform) => platform.destinationUrl)?.destinationUrl!} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {ecosystemPlatforms.find((platform) => platform.destinationUrl)?.name}
                    <ArrowUpRight className="ml-1 h-3 w-3 text-[#D4A146]" />
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4A146]">Help &amp; information</h2>
            <ul className="space-y-1">
              <li><a href={`mailto:${settings.supportEmail}`} className={linkClass}>{settings.supportEmail}</a></li>
              <li><button type="button" onClick={() => navigate('/terms')} className={linkClass}>Terms &amp; conditions</button></li>
              <li><button type="button" onClick={() => navigate('/privacy')} className={linkClass}>Privacy policy</button></li>
              <li><button type="button" onClick={() => navigate('/refund-policy')} className={linkClass}>Refund policy</button></li>
              <li><button type="button" onClick={() => navigate('/licence-policy')} className={linkClass}>Digital product licence</button></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs leading-5 text-[#9299A6] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Jeneconk Integrated Global Solutions Limited. All rights reserved.</p>
          <p>Port Harcourt, Nigeria <span className="px-1.5 text-[#D4A146]">·</span> Serving customers worldwide</p>
        </div>
      </div>
    </footer>
  );
}
