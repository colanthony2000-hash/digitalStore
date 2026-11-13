import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { extractUtmParams } from '../lib/format';
import type {
  AuthUserProfile,
  Bundle,
  Category,
  CurrencyCode,
  EcosystemPlatform,
  Product,
  StoreCollection,
  StoreSettingsPublic,
} from '../types/store';

interface StoreContextValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  categories: Category[];
  products: Product[];
  bundles: Bundle[];
  collections: StoreCollection[];
  ecosystemPlatforms: EcosystemPlatform[];
  settings: StoreSettingsPublic;
  loadingStore: boolean;
  storeError: string | null;
  refreshStorefront: () => Promise<void>;
  // Auth
  firebaseUser: FirebaseUser | null;
  profile: AuthUserProfile | null;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getAuthHeaders: () => Promise<Record<string, string>>;
  // Cart (active only when nativeCheckoutEnabled is true)
  cart: Product[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  // Navigation
  currentPath: string;
  navigate: (to: string) => void;
  // Analytics
  trackEvent: (payload: {
    eventType:
      | 'product_view'
      | 'selar_outbound_click'
      | 'free_resource_download'
      | 'category_view'
      | 'search';
    productId?: number;
    productSlug?: string;
    categorySlug?: string;
  }) => void;
}

const DEFAULT_SETTINGS: StoreSettingsPublic = {
  nativeCheckoutEnabled: false,
  nativeCheckoutToggle: false,
  paystackConfigured: false,
  paystackWebhookConfigured: false,
  paystackPublicKey: '',
  promoBannerEnabled: false,
  promoBannerText: '',
  supportEmail: 'support@jeneconk.com',
  whatsappNumber: '',
  pinterestTagId: '',
  pinterestTagConfigured: false,
  gaMeasurementId: '',
  gaConfigured: false,
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    const saved = localStorage.getItem('jeneconk_currency');
    return saved === 'USD' ? 'USD' : 'NGN';
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [collections, setCollections] = useState<StoreCollection[]>([]);
  const [ecosystemPlatforms, setEcosystemPlatforms] = useState<EcosystemPlatform[]>([]);
  const [settings, setSettings] = useState<StoreSettingsPublic>(DEFAULT_SETTINGS);
  const [loadingStore, setLoadingStore] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AuthUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [cart, setCart] = useState<Product[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname + window.location.search;
  });

  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    localStorage.setItem('jeneconk_currency', c);
  };

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname + window.location.search) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.history.pushState({}, '', to);
    setCurrentPath(to);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshStorefront = useCallback(async () => {
    try {
      setLoadingStore(true);
      setStoreError(null);
      const res = await fetch('/api/storefront');
      if (!res.ok) throw new Error('Unable to load digital store catalog.');
      const data = await res.json();
      setCategories(data.categories || []);
      setProducts(data.products || []);
      setBundles(data.bundles || []);
      setCollections(data.collections || []);
      setEcosystemPlatforms(data.ecosystemPlatforms || []);
      setSettings(data.settings || DEFAULT_SETTINGS);
    } catch (err: any) {
      setStoreError(err?.message || 'Unable to load storefront.');
    } finally {
      setLoadingStore(false);
    }
  }, []);

  useEffect(() => {
    refreshStorefront();
  }, [refreshStorefront]);

  const syncAccountProfile = useCallback(async (user: FirebaseUser) => {
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/account/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user || null);
      }
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await syncAccountProfile(user);
      } else {
        setProfile(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, [syncAccountProfile]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      if (cred.user) {
        await syncAccountProfile(cred.user);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup was closed before completing Google authentication.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Your browser blocked the Google sign-in popup. Allow popups for this site and try again.');
      } else {
        setAuthError(err?.message || 'Unable to sign in with Google right now.');
      }
    }
  };

  const signOut = async () => {
    setAuthError(null);
    await firebaseSignOut(auth);
    setProfile(null);
  };

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!auth.currentUser) return {};
    const token = await auth.currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      if (prev.some((p) => p.id === product.id)) return prev;
      return [...prev, product];
    });
    setCartOpen(true);
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((p) => p.id !== productId));
  };

  const clearCart = () => setCart([]);

  const trackEvent = useCallback(
    (payload: {
      eventType:
        | 'product_view'
        | 'selar_outbound_click'
        | 'free_resource_download'
        | 'category_view'
        | 'search';
      productId?: number;
      productSlug?: string;
      categorySlug?: string;
    }) => {
      const utm = extractUtmParams();
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ...utm }),
        keepalive: true,
      }).catch(() => {});
    },
    []
  );

  return (
    <StoreContext.Provider
      value={{
        currency,
        setCurrency,
        categories,
        products,
        bundles,
        collections,
        ecosystemPlatforms,
        settings,
        loadingStore,
        storeError,
        refreshStorefront,
        firebaseUser,
        profile,
        authLoading,
        authError,
        clearAuthError: () => setAuthError(null),
        signInWithGoogle,
        signOut,
        getAuthHeaders,
        cart,
        cartOpen,
        setCartOpen,
        addToCart,
        removeFromCart,
        clearCart,
        currentPath,
        navigate,
        trackEvent,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
