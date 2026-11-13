import React, { useState } from 'react';
import {
  ArrowUpRight,
  Menu,
  Search,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';

const BASE_NAV_ITEMS = [
  { label: 'Shop All', path: '/shop' },
  { label: 'Collections', path: '/categories' },
  { label: 'Bundles', path: '/bundles' },
  { label: 'Free Resources', path: '/free-resources' },
  { label: 'Our Platforms', path: '/ecosystem' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

export function Navbar() {
  const {
    currency,
    setCurrency,
    currentPath,
    navigate,
    settings,
    cart,
    setCartOpen,
    profile,
    firebaseUser,
    bundles,
    products,
  } = useStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const cleanPath = currentPath.split('?')[0];
  const navItems = BASE_NAV_ITEMS.filter(
    (item) => item.path !== '/bundles' || bundles.length > 0
  );
  const hasConfiguredCurrencyPricing = products.some(
    (p) => !p.isFree && (p.priceNgnKobo !== null || p.priceUsdCents !== null)
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    setSearchOpen(false);
    navigate(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop');
  };

  return (
    <div className="sticky top-0 z-40">
      {settings.promoBannerEnabled &&
        settings.promoBannerText &&
        !bannerDismissed && (
          <div className="bg-[#0A264A] text-[#FAF8F4] text-xs py-2 px-4 flex items-center justify-center gap-3 min-h-[34px] border-b border-[#D4A146]/30">
            <span className="truncate font-medium tracking-wide">
              {settings.promoBannerText}
            </span>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss announcement"
              className="text-[#FAF8F4]/75 hover:text-white p-0.5 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      <header className="bg-[#FAF8F4]/95 backdrop-blur-md border-b border-[#E4DDD0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          {/* Zone 1: Brand Identity with Official Circular Logo */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-3 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A264A] rounded-sm"
          >
            {!logoFailed ? (
              <img
                src="/assets/aistudio/logo_bf2c43a3.png"
                alt="Jeneconk Digital Store logo"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-contain shrink-0 ring-1 ring-[#0A264A]/15"
              />
            ) : (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0A264A] text-[#FAF8F4] flex items-center justify-center font-display font-bold text-lg shrink-0">
                J
              </div>
            )}
            <div className="flex flex-col leading-none">
              <span className="font-display font-semibold text-base sm:text-lg tracking-tight text-[#171A21]">
                Jeneconk
              </span>
              <span className="mt-0.5 text-[10px] font-sans font-medium uppercase tracking-[0.2em] text-[#B88329]">
                Digital Store
              </span>
            </div>
          </button>

          {/* Zone 2: Clean Single-Line Editorial Navigation */}
          <nav
            aria-label="Primary Store Navigation"
            className="hidden lg:flex items-center gap-7 text-[13px] font-medium text-[#4A505C]"
          >
            {navItems.map((item) => {
              const active = cleanPath.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`whitespace-nowrap shrink-0 py-1.5 border-b transition-colors ${
                    active
                      ? 'text-[#0A264A] border-[#B88329] font-semibold'
                      : 'border-transparent hover:text-[#171A21] hover:border-[#D5CCB9]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Search, Currency, Quick Checkout / Bag, Account */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search digital products"
              className="p-2 text-[#4A505C] hover:text-[#171A21] hover:bg-[#F3EEE4] rounded-sm transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <Search className="w-4 h-4" />
            </button>

            {hasConfiguredCurrencyPricing ? (
              <div
                className="flex items-center border border-[#D5CCB9] bg-white rounded-sm p-0.5 text-[11px] font-mono"
                role="group"
                aria-label="Currency selector"
              >
                <button
                  type="button"
                  onClick={() => setCurrency('NGN')}
                  className={`px-2 py-1 rounded-[2px] transition-colors whitespace-nowrap ${
                    currency === 'NGN'
                      ? 'bg-[#0A264A] text-[#FAF8F4] font-semibold'
                      : 'text-[#4A505C] hover:text-[#171A21]'
                  }`}
                >
                  NGN
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`px-2 py-1 rounded-[2px] transition-colors whitespace-nowrap ${
                    currency === 'USD'
                      ? 'bg-[#0A264A] text-[#FAF8F4] font-semibold'
                      : 'text-[#4A505C] hover:text-[#171A21]'
                  }`}
                >
                  USD
                </button>
              </div>
            ) : (
              <span
                title="Live NGN and USD prices are displayed on Selar"
                className="hidden md:inline-flex items-center px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FAF8F4] rounded-sm text-[11px] font-mono text-[#6D7380] whitespace-nowrap"
              >
                NGN · USD on Selar
              </span>
            )}

            {settings.nativeCheckoutEnabled ? (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                aria-label="Open shopping bag"
                className="relative p-2 text-[#171A21] hover:bg-[#F3EEE4] rounded-sm transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <ShoppingBag className="w-4 h-4" />
                {cart.length > 0 && (
                  <span className="ml-1 text-xs font-mono font-semibold text-[#0A264A] tabular-nums">
                    {cart.length}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                aria-label="Open Quick Checkout"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium text-[#171A21] border border-[#D5CCB9] bg-white hover:bg-[#F3EEE4] rounded-sm transition-colors min-h-[40px] whitespace-nowrap shrink-0"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[#B88329]" />
                <span className="hidden sm:inline">Quick Checkout</span>
              </button>
            )}

            {profile?.role === 'admin' && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="hidden sm:inline-flex items-center px-3 py-2 text-xs font-medium text-[#0A264A] border border-[#D5CCB9] bg-white hover:bg-[#F3EEE4] rounded-sm transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
              >
                Admin
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/account')}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <User className="w-3.5 h-3.5" />
              <span>{firebaseUser ? 'Account' : 'Sign In'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="lg:hidden p-2 text-[#171A21] hover:bg-[#F3EEE4] rounded-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Inline Expandable Search Bar */}
        {searchOpen && (
          <div className="border-t border-[#E4DDD0] bg-white px-4 sm:px-6 lg:px-8 py-3.5">
            <form
              onSubmit={handleSearchSubmit}
              className="max-w-3xl mx-auto flex items-center gap-2.5"
            >
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search planners, lesson guides, spreadsheets, AI toolkits..."
                className="flex-1 px-4 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0A264A]"
                autoFocus
              />
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm whitespace-nowrap min-h-[42px]"
              >
                Search
              </button>
            </form>
          </div>
        )}

        {/* Responsive Mobile & Tablet Navigation Drawer */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-[#E4DDD0] bg-[#FAF8F4] px-4 py-4 space-y-1 max-h-[75vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                navigate('/');
                setMobileOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-sm text-sm font-medium transition-colors min-h-[44px] ${
                cleanPath === '/'
                  ? 'bg-[#F3EEE4] text-[#0A264A] font-semibold'
                  : 'text-[#4A505C] hover:bg-[#F3EEE4]/70'
              }`}
            >
              Home
            </button>
            {navItems.map((item) => {
              const active = cleanPath.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    setMobileOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-sm text-sm font-medium transition-colors min-h-[44px] ${
                    active
                      ? 'bg-[#F3EEE4] text-[#0A264A] font-semibold'
                      : 'text-[#4A505C] hover:bg-[#F3EEE4]/70'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            <div className="pt-3 mt-3 border-t border-[#E4DDD0] flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigate('/account');
                  setMobileOpen(false);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-[#FAF8F4] bg-[#0A264A] rounded-sm min-h-[44px]"
              >
                {firebaseUser ? 'Customer Account' : 'Sign In'}
              </button>
              {profile?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    navigate('/admin');
                    setMobileOpen(false);
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-[#0A264A] bg-white border border-[#D5CCB9] rounded-sm min-h-[44px]"
                >
                  Admin
                </button>
              )}
            </div>
          </div>
        )}
      </header>
    </div>
  );
}
