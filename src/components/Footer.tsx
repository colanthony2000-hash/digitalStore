import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export function Footer() {
  const { categories, products, bundles, ecosystemPlatforms, navigate, settings } =
    useStore();
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <footer className="bg-[#091526] text-[#D7D2C8] border-t border-[#1A2B45]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          {/* Brand & Parent Company */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {!logoFailed ? (
                <img
                  src="/assets/aistudio/logo_bf2c43a3.png"
                  alt="Jeneconk Digital Store logo"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="w-10 h-10 rounded-full object-contain shrink-0 ring-1 ring-[#D4A146]/40"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#0A264A] text-white flex items-center justify-center font-display font-bold text-lg shrink-0">
                  J
                </div>
              )}
              <div>
                <h2 className="font-display text-lg font-semibold text-[#FAF8F4]">
                  Jeneconk Digital Store
                </h2>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#D4A146]">
                  digital.jeneconk.com
                </p>
              </div>
            </div>
            <p className="text-xs italic font-display text-[#D7D2C8]/90">
              Practical Resources. Smarter Work. Better Living.
            </p>
            <p className="text-sm text-[#A9A69E] leading-relaxed">
              Dedicated digital products marketplace operated by{' '}
              <span className="text-[#FAF8F4] font-medium">
                Jeneconk Integrated Global Solutions Limited
              </span>
              , Port Harcourt, Nigeria.
            </p>
            <div className="pt-1 flex flex-wrap gap-5 text-xs">
              <a
                href="https://www.jeneconk.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#FAF8F4] hover:text-[#D4A146] font-medium transition-colors"
              >
                <span>www.jeneconk.com</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://www.pinterest.com/jeneconkglobal/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
              >
                <span>Pinterest</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Departments */}
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#D4A146] mb-4">
              Product Departments
            </h3>
            <ul className="space-y-2.5 text-sm">
              {categories
                .filter((cat) =>
                  products.some((p) => p.categoryId === cat.id)
                )
                .map((cat) => (
                  <li key={cat.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/categories/${cat.slug}`)}
                      className="text-left text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                    >
                      {cat.name}
                    </button>
                  </li>
                ))}
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/shop')}
                  className="text-left text-[#FAF8F4] hover:text-[#D4A146] font-medium transition-colors"
                >
                  Browse Full Catalog
                </button>
              </li>
            </ul>
          </div>

          {/* Store & Ecosystem */}
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#D4A146] mb-4">
              Store &amp; Ecosystem
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/shop')}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  Shop All Editions
                </button>
              </li>
              {bundles.length > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => navigate('/bundles')}
                    className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                  >
                    Digital Bundles
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/free-resources')}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  Free Resources
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/ecosystem')}
                  className="text-[#FAF8F4] hover:text-[#D4A146] font-medium transition-colors"
                >
                  Our Platforms Directory
                </button>
              </li>
              {ecosystemPlatforms
                .filter((pl) => Boolean(pl.destinationUrl))
                .slice(0, 4)
                .map((pl) => (
                  <li key={pl.id}>
                    <a
                      href={pl.destinationUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                    >
                      <span>{pl.name}</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </li>
                ))}
            </ul>
          </div>

          {/* Support & Policies */}
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#D4A146] mb-4">
              Support &amp; Policies
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/contact')}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  Customer Assistance
                </button>
              </li>
              <li>
                <a
                  href={`mailto:${settings.supportEmail}`}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  {settings.supportEmail}
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/terms')}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/privacy')}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/refund-policy')}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  Refund Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/licence-policy')}
                  className="text-[#A9A69E] hover:text-[#FAF8F4] transition-colors"
                >
                  Digital Product Licence Policy
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-[#1A2B45] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#8D929E]">
          <p>
            &copy; {new Date().getFullYear()} Jeneconk Integrated Global Solutions Limited. All rights reserved.
          </p>
          <p>Port Harcourt, Nigeria · Serving Nigerian &amp; International Customers</p>
        </div>
      </div>
    </footer>
  );
}
