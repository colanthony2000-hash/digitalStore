import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Lock, ShoppingBag, Trash2, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  buildSelarCheckoutUrl,
  formatMinorPrice,
  getProductDisplayPrice,
} from '../lib/format';

export function CartDrawer() {
  const {
    cart,
    cartOpen,
    setCartOpen,
    removeFromCart,
    currency,
    firebaseUser,
    settings,
    products,
    navigate,
  } = useStore();

  const [email, setEmail] = useState(firebaseUser?.email || '');
  const [discountCode, setDiscountCode] = useState('');
  const [discountMinor, setDiscountMinor] = useState(0);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cartOpen) return null;

  const subtotalMinor = cart.reduce((sum, p) => {
    const info = getProductDisplayPrice(p, currency);
    return sum + (info.minorValue || 0);
  }, 0);

  const totalMinor = Math.max(0, subtotalMinor - discountMinor);

  const applyDiscount = async () => {
    setDiscountMessage(null);
    if (!discountCode.trim()) return;
    try {
      const res = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: discountCode.trim(),
          currency,
          subtotalMinor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiscountMinor(0);
        setDiscountMessage(data.error || 'Invalid discount code.');
        return;
      }
      setDiscountMinor(data.discountMinor || 0);
      setDiscountMessage(`Applied ${data.code}`);
    } catch {
      setDiscountMessage('Unable to validate discount code.');
    }
  };

  const handleCheckout = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch('/api/checkout/initialize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          productIds: cart.map((p) => p.id),
          currency,
          customerEmail: email || firebaseUser?.email,
          customerName: firebaseUser?.displayName || undefined,
          discountCode: discountMinor > 0 ? discountCode.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to start Paystack checkout.');
        return;
      }
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      }
    } catch (err: any) {
      setError(err?.message || 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const selarReadyProducts = products
    .filter((p) => Boolean(p.marketplaceUrl))
    .slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#091526]/50 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-[#FAF8F4] h-full flex flex-col border-l border-[#D5CCB9] shadow-2xl"
        role="dialog"
        aria-label={settings.nativeCheckoutEnabled ? 'Shopping Bag' : 'Quick Checkout on Selar'}
      >
        <div className="px-6 py-4 bg-white border-b border-[#E4DDD0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings.nativeCheckoutEnabled ? (
              <ShoppingBag className="w-4 h-4 text-[#0A264A]" />
            ) : (
              <ArrowUpRight className="w-4 h-4 text-[#B88329]" />
            )}
            <h2 className="font-display font-semibold text-lg text-[#171A21]">
              {settings.nativeCheckoutEnabled
                ? `Your Digital Bag (${cart.length})`
                : 'Quick Checkout'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label={settings.nativeCheckoutEnabled ? 'Close bag' : 'Close Quick Checkout'}
            className="p-2 text-[#4A505C] hover:text-[#171A21] rounded-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!settings.nativeCheckoutEnabled ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="bg-white border border-[#E4DDD0] p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#B88329]">
                <Lock className="w-3.5 h-3.5" />
                <span>Direct Selar Checkout Active</span>
              </div>
              <p className="text-sm text-[#4A505C] leading-relaxed">
                No on-site shopping cart is required. Select any digital edition below to complete purchase and receive instant file delivery directly on Selar.
              </p>
            </div>

            {selarReadyProducts.length > 0 && (
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#6D7380] font-semibold">
                  Available Editions
                </p>
                <div className="space-y-2.5">
                  {selarReadyProducts.map((item) => {
                    const itemPrice = getProductDisplayPrice(item, currency);
                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-[#E4DDD0] p-4 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setCartOpen(false);
                              navigate(`/products/${item.slug}`);
                            }}
                            className="font-display font-semibold text-sm text-[#171A21] hover:text-[#0A264A] text-left truncate block w-full"
                          >
                            {item.name}
                          </button>
                          <p className="text-xs font-mono text-[#6D7380] mt-0.5">
                            {item.fileFormat} ·{' '}
                            {item.isFree
                              ? 'Free on Selar'
                              : itemPrice.isConfigured
                              ? itemPrice.current
                              : 'View current price on Selar'}
                          </p>
                        </div>
                        {item.marketplaceUrl && (
                          <a
                            href={buildSelarCheckoutUrl(
                              item.marketplaceUrl,
                              item.slug,
                              'product_card'
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm shrink-0"
                          >
                            <span>{item.isFree ? 'Get Free' : 'Buy'}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setCartOpen(false);
                navigate('/shop');
              }}
              className="w-full py-3 px-4 text-xs font-semibold text-[#0A264A] bg-white border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <span>Browse Full Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cart.length === 0 ? (
                <p className="text-sm text-[#4A505C]">
                  Your bag is currently empty. Add eligible digital editions to proceed.
                </p>
              ) : (
                cart.map((item) => {
                  const price = getProductDisplayPrice(item, currency);
                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 pb-4 border-b border-[#E4DDD0]"
                    >
                      <div>
                        <h3 className="font-display font-semibold text-sm text-[#171A21]">
                          {item.name}
                        </h3>
                        <p className="text-xs text-[#6D7380] mt-0.5">
                          {item.fileFormat} · v{item.version}
                        </p>
                        <p className="font-mono text-sm font-semibold text-[#171A21] mt-1.5 tabular-nums">
                          {price.current}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="p-1.5 text-[#6D7380] hover:text-rose-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-6 border-t border-[#E4DDD0] bg-white space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#4A505C] mb-1">
                    Delivery &amp; Receipt Email
                  </label>
                  <input
                    type="email"
                    value={email || firebaseUser?.email || ''}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder="Discount code"
                    className="flex-1 px-3 py-2 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm uppercase"
                  />
                  <button
                    type="button"
                    onClick={applyDiscount}
                    className="px-4 py-2 text-xs font-semibold text-[#171A21] bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm hover:bg-[#F3EEE4]"
                  >
                    Apply
                  </button>
                </div>
                {discountMessage && (
                  <p className="text-xs text-[#4A505C]">{discountMessage}</p>
                )}

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-[#4A505C]">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">
                      {formatMinorPrice(subtotalMinor, currency)}
                    </span>
                  </div>
                  {discountMinor > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount</span>
                      <span className="font-mono tabular-nums">
                        -{formatMinorPrice(discountMinor, currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-[#171A21] pt-2 border-t border-[#E4DDD0]">
                    <span>Total</span>
                    <span className="font-mono tabular-nums">
                      {formatMinorPrice(totalMinor, currency)}
                    </span>
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-sm p-2.5">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleCheckout}
                  className="w-full py-3 text-sm font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Connecting to Paystack...' : 'Pay Securely with Paystack'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
