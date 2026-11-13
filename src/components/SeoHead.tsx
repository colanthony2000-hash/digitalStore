import { useEffect } from 'react';

interface SeoHeadProps {
  title: string;
  description: string;
  path?: string;
  image?: string | null;
  type?: 'website' | 'product';
  jsonLd?: Record<string, unknown> | null;
}

export function SeoHead({
  title,
  description,
  path,
  image,
  type = 'website',
  jsonLd,
}: SeoHeadProps) {
  useEffect(() => {
    document.title = title;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        if (selector.includes('property=')) {
          const prop = selector.match(/property="([^"]+)"/)?.[1];
          if (prop) el.setAttribute('property', prop);
        } else {
          const name = selector.match(/name="([^"]+)"/)?.[1];
          if (name) el.setAttribute('name', name);
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    const origin = window.location.origin;
    const canonicalUrl = `${origin}${path || window.location.pathname}`;
    const fullImage = image
      ? image.startsWith('http')
        ? image
        : `${origin}${image}`
      : undefined;

    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:type"]', 'content', type);
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);

    if (fullImage) {
      setMeta('meta[property="og:image"]', 'content', fullImage);
      setMeta('meta[name="twitter:image"]', 'content', fullImage);
    }

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const scriptId = 'jeneconk-structured-data';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) existingScript.remove();

    if (jsonLd) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [title, description, path, image, type, jsonLd]);

  return null;
}
