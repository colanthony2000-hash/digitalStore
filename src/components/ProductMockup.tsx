import { useState } from 'react';
import { BookOpen, FileSpreadsheet, Layers } from 'lucide-react';
import type { Product } from '../types/store';

interface ProductMockupProps {
  product: Pick<
    Product,
    'slug' | 'name' | 'fileFormat' | 'coverImage' | 'version' | 'isFree'
  >;
  overrideImage?: string | null;
  variant?: 'card' | 'detail' | 'hero';
  categoryName?: string;
}

type MockupArchetype = 'book' | 'poster' | 'workbook' | 'spreadsheet' | 'toolkit';

function isPromotionalPosterAsset(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.includes('_Poster_') ||
    url.includes('7_ESSENTIAL') ||
    url.includes('Christmas_Budget_Planner') ||
    url.includes('christmas_planner_card_cover') ||
    url.includes('lesson_note_free_mini_guide_card_cover')
  );
}

function resolveArchetype(
  slug: string,
  fileFormat: string,
  imageSrc: string | null | undefined
): MockupArchetype {
  if (isPromotionalPosterAsset(imageSrc)) {
    return 'poster';
  }
  const fmt = fileFormat.toUpperCase();
  if (fmt === 'XLSX' || fmt === 'XLS' || fmt === 'CSV') {
    return 'spreadsheet';
  }
  if (fmt === 'ZIP' || fmt === 'PPTX') {
    return 'toolkit';
  }
  if (
    slug.includes('lesson-note') ||
    slug.includes('guide') ||
    slug.includes('manual') ||
    slug.includes('ebook')
  ) {
    return 'book';
  }
  return 'workbook';
}

export function ProductMockup({
  product,
  overrideImage,
  variant = 'card',
  categoryName,
}: ProductMockupProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const imageSrc = overrideImage !== undefined ? overrideImage : product.coverImage;
  const hasRealCover = Boolean(imageSrc && !imgFailed);
  const archetype = resolveArchetype(product.slug, product.fileFormat, imageSrc);

  const stagePadding =
    variant === 'hero'
      ? 'p-4 sm:p-5'
      : variant === 'detail'
      ? 'p-6 sm:p-10'
      : 'p-4 sm:p-5';

  const frameSize =
    variant === 'hero'
      ? 'w-44 sm:w-52'
      : variant === 'detail'
      ? 'w-64 sm:w-80'
      : 'w-44 sm:w-48';

  return (
    <div
      className={`mockup-stage relative w-full h-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#F3EEE4] via-[#FAF8F4] to-[#EAE2D3] ${stagePadding}`}
    >
      {/* Subtle architectural grid hairline for editorial depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 border border-[#E2D9C8]/75"
      />

      {archetype === 'poster' && hasRealCover ? (
        /* Crisp Straight Matted Presentation for Promotional Selar Posters / Rich Graphic Mockups */
        <div
          className={`relative z-10 h-full w-full flex items-center justify-center transition-transform duration-300 group-hover:-translate-y-1`}
        >
          <div className="relative h-full max-h-full aspect-[2/3] bg-white p-1.5 sm:p-2 border border-[#D4CBB8] shadow-[0_18px_38px_-14px_rgba(10,26,48,0.24)]">
            <img
              src={imageSrc!}
              alt={`${product.name} — ${product.fileFormat} edition artwork`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-contain bg-[#FAF8F4]"
            />
          </div>
        </div>
      ) : archetype === 'spreadsheet' ? (
        /* Structured Spreadsheet / Template Frame */
        <div className="relative z-10 w-full max-w-[300px] bg-white border border-[#D4CBB8] shadow-[0_18px_38px_-14px_rgba(10,26,48,0.2)] transition-transform duration-300 group-hover:-translate-y-1">
          <div className="px-3 py-2 bg-[#0A264A] text-[#FAF8F4] flex items-center justify-between text-[10px] font-mono tracking-wider">
            <span>{product.fileFormat} TEMPLATE</span>
            <span className="text-[#D4A146]">v{product.version}</span>
          </div>
          <div className="aspect-[4/3] bg-[#FAF8F4] relative overflow-hidden">
            {hasRealCover ? (
              <img
                src={imageSrc!}
                alt={`${product.name} — ${product.fileFormat} template preview`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full p-5 flex flex-col justify-between bg-white">
                <div className="flex items-center justify-between text-[#0A264A]">
                  <FileSpreadsheet className="w-6 h-6" strokeWidth={1.5} />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#B88329]">
                    Temporary Preview
                  </span>
                </div>
                <div>
                  <p className="font-display font-semibold text-base text-[#171A21] leading-snug">
                    {product.name}
                  </p>
                  <p className="mt-1 text-[11px] text-[#6D7380]">
                    Digital Template Preview
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-[#E4DDD0]">
                  <div className="h-2 bg-[#F3EEE4]" />
                  <div className="h-2 bg-[#EBE4D6]" />
                  <div className="h-2 bg-[#F3EEE4]" />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tactile 3D Book or Bound Workbook Folio for Clean Vertical Front Covers */
        <div
          className={`relative z-10 aspect-[3/4] ${frameSize} ${
            archetype === 'book' ? 'mockup-book-frame' : 'mockup-workbook-frame'
          } bg-[#0A264A] overflow-hidden border border-[#171A21]/15`}
        >
          {/* Left Spine / Binding Light Ridge */}
          <div
            aria-hidden="true"
            className={`absolute inset-y-0 left-0 z-20 pointer-events-none ${
              archetype === 'book'
                ? 'w-3.5 bg-gradient-to-r from-black/35 via-white/15 to-transparent border-r border-white/15'
                : 'w-2.5 bg-gradient-to-r from-black/25 via-white/10 to-transparent'
            }`}
          />

          {hasRealCover ? (
            <img
              src={imageSrc!}
              alt={`${product.name} — ${product.fileFormat} digital edition cover`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            /* Editorial Temporary Preview Cover when Admin has not uploaded a cover image yet */
            <div className="w-full h-full bg-gradient-to-b from-[#0A264A] via-[#0E315E] to-[#071B36] text-[#FAF8F4] p-5 sm:p-6 flex flex-col justify-between relative">
              <div
                aria-hidden="true"
                className="absolute inset-3 border border-[#D4A146]/40 pointer-events-none"
              />
              <div className="relative z-10 flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-[#D4A146]">
                <span>Jeneconk Edition</span>
                <span>{product.fileFormat}</span>
              </div>

              <div className="relative z-10 my-auto py-3">
                <div className="w-8 h-[1px] bg-[#D4A146] mb-3" />
                {categoryName && (
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#FAF8F4]/70 mb-1.5 line-clamp-1">
                    {categoryName}
                  </p>
                )}
                <h4 className="font-display text-lg sm:text-xl font-semibold leading-tight text-white">
                  {product.name}
                </h4>
              </div>

              <div className="relative z-10 pt-3 border-t border-white/15 flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-[0.14em] text-[#FAF8F4]/75">
                  Temporary Preview
                </span>
                {archetype === 'book' ? (
                  <BookOpen className="w-3.5 h-3.5 text-[#D4A146]" strokeWidth={1.6} />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#D4A146]" strokeWidth={1.6} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtle Bottom-Right Format Spec Tag (editorial unboxed type, never pill) */}
      <div className="absolute bottom-2 right-5 text-[10px] font-mono uppercase tracking-[0.14em] text-[#6D7380] bg-[#FAF8F4]/85 px-1.5">
        {product.fileFormat}
        {product.isFree ? ' · FREE' : ''}
      </div>
    </div>
  );
}
