import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  applyActionCode,
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  verifyPasswordResetCode,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { extractUtmParams } from '../lib/format';
import { hasPermission, isAdminConsoleRole, type AdminPermission } from '../lib/rbac';
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

interface AuthActionResult {
  ok: boolean;
  message?: string;
  needsVerification?: boolean;
}

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
  isConsoleAuthorized: boolean;
  hasAdminPermission: (permission: AdminPermission) => boolean;
  registerWithEmail: (params: {
    fullName: string;
    email: string;
    password: string;
    termsAccepted: boolean;
  }) => Promise<AuthActionResult>;
  signInWithEmail: (params: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => Promise<AuthActionResult>;
  signInWithGoogle: (rememberMe?: boolean) => Promise<AuthActionResult>;
  sendPasswordReset: (email: string) => Promise<AuthActionResult>;
  resendVerificationEmail: () => Promise<AuthActionResult>;
  verifyResetOobCode: (oobCode: string) => Promise<{ ok: boolean; email?: string; message?: string }>;
  confirmResetOobCode: (oobCode: string, newPassword: string) => Promise<AuthActionResult>;
  applyVerificationOobCode: (oobCode: string) => Promise<AuthActionResult>;
  reauthenticateWithPassword: (password: string) => Promise<AuthActionResult>;
  reauthenticateWithGoogle: () => Promise<AuthActionResult>;
  invalidateOtherSessions: (reason?: string) => Promise<AuthActionResult>;
  refreshAccountProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  getAuthHeaders: () => Promise<Record<string, string>>;
  // Cart
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
  supportEmail: 'info@jeneconk.com',
  businessEmail: 'business@jeneconk.com',
  whatsappNumber: '',
  pinterestTagId: '',
  pinterestTagConfigured: false,
  gaMeasurementId: '',
  gaConfigured: false,
};

const StoreContext = createContext<StoreContextValue | null>(null);

async function logAuthTelemetry(
  eventType:
    | 'registered'
    | 'login_password'
    | 'login_google'
    | 'login_failed'
    | 'email_verified'
    | 'password_reset_requested',
  details?: string,
  user?: FirebaseUser | null,
  termsAccepted?: boolean
) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user) {
      const token = await user.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    }
    await fetch('/api/auth/event', {
      method: 'POST',
      headers,
      body: JSON.stringify({ eventType, details, termsAccepted }),
    });
  } catch {
    // Non-blocking telemetry
  }
}

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
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data?.code === 'SESSION_INVALIDATED') {
          await firebaseSignOut(auth);
          setProfile(null);
          setAuthError(
            data.error ||
              'Your session was invalidated following a password reset or security action. Please sign in again.'
          );
          return;
        }
      }
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user || null);
      }
    } catch {
      setProfile(null);
    }
  }, []);

  const refreshAccountProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setFirebaseUser(auth.currentUser);
    await syncAccountProfile(auth.currentUser);
  }, [syncAccountProfile]);

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

  const registerWithEmail = async ({
    fullName,
    email,
    password,
    termsAccepted,
  }: {
    fullName: string;
    email: string;
    password: string;
    termsAccepted: boolean;
  }): Promise<AuthActionResult> => {
    setAuthError(null);
    if (!termsAccepted) {
      const msg = 'You must accept the Terms & Conditions and Privacy Policy to create an account.';
      setAuthError(msg);
      return { ok: false, message: msg };
    }
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: fullName.trim() });
      await cred.user.getIdToken(true);
      try {
        await sendEmailVerification(cred.user, {
          url: `${window.location.origin}/account`,
          handleCodeInApp: false,
        });
      } catch {
        // Non-fatal if browser rate limits duplicate email sends
      }
      await logAuthTelemetry('registered', 'Email/password registration.', cred.user, true);
      await syncAccountProfile(cred.user);
      return {
        ok: true,
        needsVerification: !cred.user.emailVerified,
        message:
          'Account created. We have sent a verification link to your email address—please verify your inbox.',
      };
    } catch (err: any) {
      const code = err?.code || '';
      let msg = 'Unable to create your account right now. Please try again.';
      if (code === 'auth/email-already-in-use') {
        msg =
          'An account with this email address already exists. Please sign in instead or use Forgot Password.';
      } else if (code === 'auth/weak-password') {
        msg = 'Please choose a stronger password meeting all stated requirements.';
      } else if (code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Too many attempts detected. Please wait a few minutes before trying again.';
      }
      setAuthError(msg);
      return { ok: false, message: msg };
    }
  };

  const signInWithEmail = async ({
    email,
    password,
    rememberMe = true,
  }: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<AuthActionResult> => {
    setAuthError(null);
    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await logAuthTelemetry('login_password', 'Password sign-in succeeded.', cred.user);
      await syncAccountProfile(cred.user);
      return {
        ok: true,
        needsVerification: !cred.user.emailVerified,
      };
    } catch (err: any) {
      const code = err?.code || '';
      await logAuthTelemetry('login_failed', `Password sign-in failed (${code || 'unknown'}).`);
      let msg = 'Invalid email address or password.';
      if (code === 'auth/too-many-requests') {
        msg =
          'Too many unsuccessful sign-in attempts. Access is temporarily rate-limited—please wait a few minutes or reset your password.';
      } else if (code === 'auth/user-disabled') {
        msg = 'This account has been disabled. Please contact info@jeneconk.com.';
      } else if (code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setAuthError(msg);
      return { ok: false, message: msg };
    }
  };

  const signInWithGoogle = async (rememberMe = true): Promise<AuthActionResult> => {
    setAuthError(null);
    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      const cred = await signInWithPopup(auth, googleAuthProvider);
      if (cred.user) {
        await logAuthTelemetry('login_google', 'Google sign-in succeeded.', cred.user);
        await syncAccountProfile(cred.user);
      }
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || '';
      let msg = err?.message || 'Unable to sign in with Google right now.';
      if (code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in popup was closed before completing Google authentication.';
      } else if (code === 'auth/popup-blocked') {
        msg =
          'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
      } else if (code === 'auth/account-exists-with-different-credential') {
        msg =
          'An account already exists for this email using password sign-in. Sign in with your email and password first.';
      }
      setAuthError(msg);
      return { ok: false, message: msg };
    }
  };

  const sendPasswordReset = async (email: string): Promise<AuthActionResult> => {
    setAuthError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const msg = 'Please enter a valid email address.';
      setAuthError(msg);
      return { ok: false, message: msg };
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail, {
        url: `${window.location.origin}/account`,
        handleCodeInApp: false,
      });
      await logAuthTelemetry('password_reset_requested', 'Customer requested reset link.');
    } catch (err: any) {
      const code = err?.code || '';
      // Never disclose account existence on password reset
      if (code !== 'auth/user-not-found' && code !== 'auth/invalid-email') {
        if (code === 'auth/too-many-requests') {
          const msg = 'Too many password reset requests. Please wait a few minutes and try again.';
          setAuthError(msg);
          return { ok: false, message: msg };
        }
      }
    }
    return {
      ok: true,
      message:
        'If an account is registered for that email address, a single-use password reset link has been sent.',
    };
  };

  const resendVerificationEmail = async (): Promise<AuthActionResult> => {
    if (!auth.currentUser) {
      return { ok: false, message: 'Sign in first to resend your verification email.' };
    }
    try {
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/account`,
        handleCodeInApp: false,
      });
      return {
        ok: true,
        message: `Verification email sent to ${auth.currentUser.email}. Check your inbox and spam folder.`,
      };
    } catch (err: any) {
      if (err?.code === 'auth/too-many-requests') {
        return {
          ok: false,
          message: 'Please wait a minute before requesting another verification email.',
        };
      }
      return { ok: false, message: err?.message || 'Unable to resend verification email.' };
    }
  };

  const verifyResetOobCode = async (oobCode: string) => {
    try {
      const email = await verifyPasswordResetCode(auth, oobCode);
      return { ok: true, email };
    } catch (err: any) {
      return {
        ok: false,
        message:
          err?.code === 'auth/expired-action-code'
            ? 'This password reset link has expired. Please request a new reset email.'
            : 'This password reset link is invalid or has already been used.',
      };
    }
  };

  const confirmResetOobCode = async (
    oobCode: string,
    newPassword: string
  ): Promise<AuthActionResult> => {
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      return {
        ok: true,
        message: 'Your password has been updated. Please sign in with your new password.',
      };
    } catch (err: any) {
      return {
        ok: false,
        message:
          err?.code === 'auth/weak-password'
            ? 'Please choose a stronger password.'
            : 'Unable to reset password with this link. It may have expired.',
      };
    }
  };

  const applyVerificationOobCode = async (oobCode: string): Promise<AuthActionResult> => {
    try {
      await applyActionCode(auth, oobCode);
      if (auth.currentUser) {
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
        await logAuthTelemetry('email_verified', 'Email address verified via link.', auth.currentUser);
        await syncAccountProfile(auth.currentUser);
      }
      return {
        ok: true,
        message: 'Your email address is now verified.',
      };
    } catch {
      return {
        ok: false,
        message: 'This verification link is invalid or has expired. Sign in to request a new one.',
      };
    }
  };

  const reauthenticateWithPassword = async (password: string): Promise<AuthActionResult> => {
    if (!auth.currentUser || !auth.currentUser.email) {
      return { ok: false, message: 'No active email session.' };
    }
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await auth.currentUser.getIdToken(true);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Password verification failed. Please check your password.' };
    }
  };

  const reauthenticateWithGoogle = async (): Promise<AuthActionResult> => {
    if (!auth.currentUser) {
      return { ok: false, message: 'No active user session.' };
    }
    try {
      await reauthenticateWithPopup(auth.currentUser, googleAuthProvider);
      await auth.currentUser.getIdToken(true);
      return { ok: true };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || 'Google reauthentication could not be completed.',
      };
    }
  };

  const invalidateOtherSessions = async (reason = 'user_security_action'): Promise<AuthActionResult> => {
    if (!auth.currentUser) return { ok: false, message: 'Not signed in.' };
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch('/api/account/session-invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return { ok: false, message: d.error || 'Unable to invalidate sessions.' };
      }
      return {
        ok: true,
        message: 'All older sessions have been signed out and invalidated.',
      };
    } catch {
      return { ok: false, message: 'Network error invalidating older sessions.' };
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

  const isConsoleAuthorized = isAdminConsoleRole(profile?.role);
  const hasAdminPermission = useCallback(
    (permission: AdminPermission) => hasPermission(profile?.role, permission),
    [profile?.role]
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
        isConsoleAuthorized,
        hasAdminPermission,
        registerWithEmail,
        signInWithEmail,
        signInWithGoogle,
        sendPasswordReset,
        resendVerificationEmail,
        verifyResetOobCode,
        confirmResetOobCode,
        applyVerificationOobCode,
        reauthenticateWithPassword,
        reauthenticateWithGoogle,
        invalidateOtherSessions,
        refreshAccountProfile,
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
