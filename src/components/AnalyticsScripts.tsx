import { useEffect, useRef } from 'react';
import { useStore } from '../context/StoreContext';

declare global {
  interface Window {
    pintrk?: (...args: any[]) => void;
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export function AnalyticsScripts() {
  const { settings, currentPath } = useStore();
  const pinterestLoadedId = useRef<string | null>(null);
  const gaLoadedId = useRef<string | null>(null);

  // Only load and initialise Pinterest Tag when a genuine numeric Tag ID is configured
  useEffect(() => {
    const tagId = settings.pinterestTagId?.trim();
    if (
      !settings.pinterestTagConfigured ||
      !tagId ||
      !/^\d{8,20}$/.test(tagId)
    ) {
      return;
    }

    if (pinterestLoadedId.current !== tagId) {
      pinterestLoadedId.current = tagId;
      if (!window.pintrk) {
        const pintrkFn: any = function (...args: any[]) {
          pintrkFn.queue.push(args);
        };
        pintrkFn.queue = [];
        pintrkFn.version = '3.0';
        window.pintrk = pintrkFn;

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://s.pinimg.com/ct/core.js';
        document.head.appendChild(script);
      }
      window.pintrk?.('load', tagId);
    }

    window.pintrk?.('page');
  }, [settings.pinterestTagConfigured, settings.pinterestTagId, currentPath]);

  // Only load Google Analytics when a genuine measurement ID is configured
  useEffect(() => {
    const gaId = settings.gaMeasurementId?.trim();
    if (
      !settings.gaConfigured ||
      !gaId ||
      !/^(G|GT|AW)-[A-Z0-9]{6,16}$/i.test(gaId)
    ) {
      return;
    }

    if (gaLoadedId.current !== gaId) {
      gaLoadedId.current = gaId;
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function (...args: any[]) {
        window.dataLayer!.push(args);
      };
      window.gtag('js', new Date());
      window.gtag('config', gaId);
    } else {
      window.gtag?.('event', 'page_view', { page_path: currentPath });
    }
  }, [settings.gaConfigured, settings.gaMeasurementId, currentPath]);

  return null;
}
