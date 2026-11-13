import { ArrowUpRight, ShoppingBag } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { buildSelarCheckoutUrl, getProductDisplayPrice } from '../lib/format';
import type { Product } from '../types/store';
import { ProductMockup } from './ProductMockup';

interface ProductCardProps {
  product: Product;
  categoryName?: string;
}

export function ProductCard({ product, categoryName }: ProductCardProps) {
  const { currency, navigate, settings, addToCart, trackEvent } = useStore();

  const price = getProductDisplayPrice(product, currency);
  const hasSelarUrl = Boolean(product.marketplaceUrl && product.marketplaceUrl.trim());
  const selarHref = hasSelarUrl
    ? buildSelarCheckoutUrl(product.marketplaceUrl!, product.slug, 'product_card')
    : null;
  const canUseNative =
    settings.nativeCheckoutEnabled &&
    product.nativeCheckoutEligible &&
    price.isConfigured &&
    !product.isFree;

  const trackSelarClick = () => {
    trackEvent({
      eventType: 'selar_outbound_click',
      productId: product.id,
      productSlug: product.slug,
    });
  };

  return (
    <article className="group flex flex-col bg-white border border-[#E4DDD0] rounded-sm overflow-hidden transition-all duration-300 hover:border-[#C5BA9F] hover:shadow-[0_18px_40px_-20px_rgba(10,26,48,0.18)]">
      <button
        type="button"
        onClick={() => navigate(`/products/${product.slug}`)}
        className="relative aspect-[4/4.6] w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A264A] border-b border-[#E4DDD0]"
        aria-label={`View ${product.name}`}
      >
        <ProductMockup
          product={product}
          categoryName={categoryName}
          variant="card"
        />
      </button>

      <div className="flex flex-col flex-1 p-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[#6D7380]">
          <span className="truncate">{categoryName || 'Digital Resource'}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono shrink-0 text-[#4A505C]">{product.fileFormat}</span>
          {product.isBestseller && product.verifiedSalesCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#B88329] font-semibold shrink-0">Bestseller</span>
            </>
          )}
        </div>

        <h3 className="mt-2.5 font-display text-xl font-semibold text-[#171A21] leading-snug">
          <button
            type="button"
            onClick={() => navigate(`/products/${product.slug}`)}
            className="text-left hover:text-[#0A264A] transition-colors focus-visible:outline-none focus-visible:underline"
          >
            {product.name}
          </button>
        </h3>

        <p className="mt-2 text-sm text-[#4A505C] line-clamp-2 leading-relaxed flex-1">
          {product.shortBenefit}
        </p>

        <div className="mt-5 pt-4 border-t border-[#EDE7DA] flex items-baseline justify-between gap-3">
          <div>
            {price.isConfigured ? (
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#171A21] tabular-nums">
                  {price.current}
                </span>
                {price.original && (
                  <span className="font-mono text-xs text-[#6D7380] line-through tabular-nums">
                    {price.original}
                  </span>
                )}
              </div>
            ) : selarHref ? (
              <a
                href={selarHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={trackSelarClick}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A264A] hover:text-[#B88329] transition-colors"
              >
                <span>View current price on Selar</span>
                <ArrowUpRight className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-xs font-medium text-[#6D7380]">
                Pricing updating soon
              </span>
            )}
          </div>
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#B88329] font-medium whitespace-nowrap">
            {product.isFree
              ? 'Complimentary'
              : canUseNative
              ? 'Instant Bag'
              : 'Via Selar'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => navigate(`/products/${product.slug}`)}
            className="px-3 py-2.5 text-xs font-medium text-[#171A21] bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm transition-colors whitespace-nowrap text-center min-h-[40px]"
          >
            Explore Edition
          </button>

          {product.isFree && selarHref && !product.hasProtectedFile ? (
            <a
              href={selarHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackSelarClick}
              className="px-3 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap min-h-[40px]"
            >
              <span>Get Free</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          ) : product.isFree ? (
            <button
              type="button"
              onClick={() => navigate(`/products/${product.slug}`)}
              className="px-3 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors whitespace-nowrap text-center min-h-[40px]"
            >
              Download Free
            </button>
          ) : canUseNative ? (
            <button
              type="button"
              onClick={() => addToCart(product)}
              className="px-3 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[40px]"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Add to Bag</span>
            </button>
          ) : selarHref ? (
            <a
              href={selarHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackSelarClick}
              className="px-3 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap min-h-[40px]"
            >
              <span>Buy on Selar</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => navigate(`/products/${product.slug}`)}
              className="px-3 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap min-h-[40px]"
            >
              <span>Details</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
