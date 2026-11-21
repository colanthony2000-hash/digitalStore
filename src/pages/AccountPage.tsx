import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  MailCheck,
  RefreshCw,
  Shield,
  ShieldCheck,
  Ticket,
  UserCheck,
} from 'lucide-react';
import { SeoHead } from '../components/SeoHead';
import { useStore } from '../context/StoreContext';
import { formatMinorPrice } from '../lib/format';
import { ROLE_LABELS } from '../lib/rbac';
import type {
  AccountEventRecord,
  CurrencyCode,
  SupportCaseRecord,
} from '../types/store';

interface OrderItemRecord {
  id: number;
  productId: number | null;
  productName: string;
  productVersion: string;
  unitPriceMinor: number;
  downloadCount: number;
  maxDownloads: number;
}

interface OrderRecord {
  id: number;
  orderReference: string;
  currency: CurrencyCode;
  totalMinor: number;
  paymentStatus: string;
  orderStatus?: string;
  fulfilmentStatus?: string;
  createdAt: string;
  items: OrderItemRecord[];
}

interface EnquiryRecord {
  id: number;
  subject: string;
  status: string;
  createdAt: string;
}

type AuthView = 'signin' | 'register' | 'forgot';

function evaluatePassword(pw: string) {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    checks,
    passed,
    strongEnough: checks.length && checks.upper && checks.lower && checks.number,
  };
}

export function AccountPage() {
  const {
    firebaseUser,
    profile,
    isConsoleAuthorized,
    authLoading,
    authError,
    clearAuthError,
    products,
    registerWithEmail,
    signInWithEmail,
    signInWithGoogle,
    sendPasswordReset,
    resendVerificationEmail,
    requestEmailCorrection,
    inspectVerificationCode,
    verifyResetOobCode,
    confirmResetOobCode,
    applyVerificationOobCode,
    invalidateOtherSessions,
    refreshAccountProfile,
    signOut,
    getAuthHeaders,
    navigate,
    clearCart,
    currentPath,
  } = useStore();

  // Auth form states
  const [authView, setAuthView] = useState<AuthView>('signin');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');

  // Firebase email action link (?mode=...&oobCode=...) state
  const [oobState, setOobState] = useState<{
    mode: 'resetPassword' | 'verifyEmail' | 'verifyAndChangeEmail' | null;
    oobCode: string | null;
    checking: boolean;
    verifiedEmailForReset?: string;
    error?: string;
    completedMessage?: string;
    actionEmail?: string;
    actionApplied?: boolean;
  }>({ mode: null, oobCode: null, checking: false });
  const [newOobPassword, setNewOobPassword] = useState('');
  const [confirmOobPassword, setConfirmOobPassword] = useState('');
  const [showOobPassword, setShowOobPassword] = useState(false);

  // Dashboard states
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [supportCases, setSupportCases] = useState<SupportCaseRecord[]>([]);
  const [activityTimeline, setActivityTimeline] = useState<AccountEventRecord[]>([]);
  const [marketplaceNotice, setMarketplaceNotice] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState<any>(null);
  const [correctedEmail, setCorrectedEmail] = useState('');
  const [requestingEmailChange, setRequestingEmailChange] = useState(false);
  const customerDisplayName =
    fullName.trim() || profile?.fullName?.trim() || firebaseUser?.displayName?.trim() || '';
  const customerFirstName = customerDisplayName.split(/\s+/)[0];

  // New Support Case inside Account Dashboard
  const [showNewCaseForm, setShowNewCaseForm] = useState(false);
  const [caseCategory, setCaseCategory] = useState('paid_no_access');
  const [caseProduct, setCaseProduct] = useState('');
  const [caseTxRef, setCaseTxRef] = useState('');
  const [caseSubject, setCaseSubject] = useState('');
  const [caseDescription, setCaseDescription] = useState('');
  const [submittingCase, setSubmittingCase] = useState(false);

  const pwEval = useMemo(() => evaluatePassword(regPassword), [regPassword]);
  const oobPwEval = useMemo(() => evaluatePassword(newOobPassword), [newOobPassword]);

  // Validate verification links without consuming their one-time code on page load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    const supportedMode =
      mode === 'resetPassword' || mode === 'verifyEmail' || mode === 'verifyAndChangeEmail';
    if (!oobCode || !supportedMode) return;

    let cancelled = false;
    setOobState({ mode, oobCode, checking: true });

    if (mode === 'resetPassword') {
      verifyResetOobCode(oobCode).then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setOobState({
            mode: 'resetPassword',
            oobCode,
            checking: false,
            verifiedEmailForReset: res.email,
          });
        } else {
          setOobState({
            mode: 'resetPassword',
            oobCode,
            checking: false,
            error: res.message,
          });
        }
      });
    } else {
      inspectVerificationCode(oobCode).then((res) => {
        if (cancelled) return;
        setOobState({
          mode,
          oobCode,
          checking: false,
          actionEmail: res.email,
          error: res.ok ? undefined : res.message,
          completedMessage: res.ok
            ? `Confirm that ${res.email || 'this email address'} belongs to you by selecting the button below.`
            : undefined,
        });
      });
    }

    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  const handleConfirmEmailAction = async () => {
    if (!oobState.oobCode) return;
    setSubmittingAuth(true);
    const result = await applyVerificationOobCode(oobState.oobCode);
    setSubmittingAuth(false);
    setOobState((state) => ({
      ...state,
      checking: false,
      actionApplied: result.ok,
      completedMessage: result.ok ? result.message : undefined,
      error: result.ok ? undefined : result.message,
    }));
    if (result.ok) {
      window.history.replaceState({}, '', '/account');
      await refreshAccountProfile().catch(() => false);
    }
  };

  const handleEmailCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    setRequestingEmailChange(true);
    const result = await requestEmailCorrection(correctedEmail);
    setRequestingEmailChange(false);
    setStatusMessage(result.message || null);
    if (result.ok) setCorrectedEmail('');
  };

  const loadAccountData = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingAccount(true);
    setAccountError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/account/me', { headers });
      const data = await res.json();
      if (!res.ok) {
        setAccountError(data.error || 'Unable to load account records.');
        return;
      }
      setOrders(data.orders || []);
      setEnquiries(data.enquiries || []);
      setSupportCases(data.supportCases || []);
      setActivityTimeline(data.activityTimeline || []);
      setMarketplaceNotice(data.marketplaceNotice || '');
      setFullName(data.user?.fullName || '');
    } catch {
      setAccountError('Network error while loading account data.');
    } finally {
      setLoadingAccount(false);
    }
  }, [firebaseUser, getAuthHeaders]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  // Verify Paystack return reference if present in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('checkout_ref') || params.get('reference');
    if (ref) {
      fetch(`/api/checkout/verify/${encodeURIComponent(ref)}`)
        .then(async (r) => ({ ok: r.ok, data: await r.json() }))
        .then(({ ok, data }) => {
          if (data.verified) {
            setVerifiedReceipt(data);
            clearCart();
            loadAccountData();
            window.history.replaceState({}, '', '/account');
          } else if (!ok) {
            setStatusMessage(
              data.error || 'Payment is not verified yet. If you were charged, contact support with your payment reference.'
            );
          }
        })
        .catch(() => {});
    }
  }, [clearCart, loadAccountData]);

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFeedback(null);
    setSubmittingAuth(true);
    const res = await signInWithEmail({
      email: loginEmail,
      password: loginPassword,
      rememberMe,
    });
    setSubmittingAuth(false);
    if (!res.ok && res.message) {
      setAuthFeedback({ type: 'error', text: res.message });
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFeedback(null);
    if (!regName.trim() || regName.trim().length < 2) {
      setAuthFeedback({ type: 'error', text: 'Please enter your full name.' });
      return;
    }
    if (!pwEval.strongEnough) {
      setAuthFeedback({
        type: 'error',
        text: 'Password must be at least 8 characters and include uppercase, lowercase, and a number.',
      });
      return;
    }
    if (regPassword !== regConfirm) {
      setAuthFeedback({
        type: 'error',
        text: 'Passwords do not match. Please verify both password fields.',
      });
      return;
    }
    if (!termsAccepted) {
      setAuthFeedback({
        type: 'error',
        text: 'Please accept the Terms & Conditions and Privacy Policy to continue.',
      });
      return;
    }
    setSubmittingAuth(true);
    const res = await registerWithEmail({
      fullName: regName,
      email: regEmail,
      password: regPassword,
      termsAccepted,
    });
    setSubmittingAuth(false);
    if (res.ok) {
      setAuthFeedback({
        type: 'success',
        text: res.message || 'Account created successfully.',
      });
    } else if (res.message) {
      setAuthFeedback({ type: 'error', text: res.message });
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFeedback(null);
    setSubmittingAuth(true);
    const res = await sendPasswordReset(resetEmail);
    setSubmittingAuth(false);
    setAuthFeedback({
      type: res.ok ? 'success' : 'error',
      text:
        res.message ||
        'If an account exists for that email address, password reset instructions have been sent.',
    });
  };

  const handleConfirmOobReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobState.oobCode) return;
    if (!oobPwEval.strongEnough) {
      setOobState((s) => ({
        ...s,
        error:
          'New password must be at least 8 characters and include uppercase, lowercase, and a number.',
      }));
      return;
    }
    if (newOobPassword !== confirmOobPassword) {
      setOobState((s) => ({ ...s, error: 'New passwords do not match.' }));
      return;
    }
    setSubmittingAuth(true);
    const res = await confirmResetOobCode(oobState.oobCode, newOobPassword);
    setSubmittingAuth(false);
    if (res.ok) {
      window.history.replaceState({}, '', '/account');
      setOobState({
        mode: 'resetPassword',
        oobCode: null,
        checking: false,
        completedMessage: res.message,
      });
      setAuthView('signin');
    } else {
      setOobState((s) => ({ ...s, error: res.message }));
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setStatusMessage(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch('/api/account/me', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fullName }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatusMessage('Profile name updated.');
        await loadAccountData();
      } else {
        setStatusMessage(json.error || 'Unable to update profile name.');
      }
    } catch {
      setStatusMessage('Network error while updating profile.');
    } finally {
      setSavingName(false);
    }
  };

  const handleDownload = async (orderItemId: number) => {
    setStatusMessage(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch('/api/account/download-link', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderItemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error || 'Unable to generate download link.');
        return;
      }
      window.location.href = data.downloadUrl;
    } catch {
      setStatusMessage('Failed to generate signed download link.');
    }
  };

  const handleCreateSupportCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCase(true);
    setStatusMessage(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch('/api/account/support-cases', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category: caseCategory,
          relatedProductSlug: caseProduct || undefined,
          transactionReference: caseTxRef.trim() || undefined,
          subject: caseSubject,
          description: caseDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error || 'Unable to submit support case.');
        return;
      }
      setStatusMessage(
        `Support case ${data.supportCase?.caseReference || ''} submitted. Our support team will respond shortly.`
      );
      setCaseSubject('');
      setCaseDescription('');
      setCaseTxRef('');
      setShowNewCaseForm(false);
      await loadAccountData();
    } catch {
      setStatusMessage('Network error submitting support case.');
    } finally {
      setSubmittingCase(false);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="h-40 bg-white border border-[#E4DDD0] rounded-sm animate-pulse" />
      </div>
    );
  }

  return (
    <div className="py-12 sm:py-16 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      <SeoHead
        title="Customer Account | Jeneconk Digital Store"
        description="Sign in or register for a Jeneconk Digital Store account to manage your profile, protected digital downloads, and customer support cases."
        path="/account"
      />

      {verifiedReceipt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-sm p-6 space-y-3">
          <div className="flex items-center gap-2 text-emerald-900 font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            <span>
              Order {verifiedReceipt.order?.orderReference} Verified &amp; Fulfilled
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(verifiedReceipt.downloadLinks || []).map((dl: any) => (
              <a
                key={dl.orderItemId}
                href={dl.downloadUrl}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {dl.productName}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Firebase OOB Password Reset or Email Verification Action Handler */}
      {(oobState.mode === 'verifyEmail' || oobState.mode === 'verifyAndChangeEmail') && (
        <div
          className={`rounded-sm border p-5 ${
            oobState.error
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <p className="text-sm font-medium">
            {oobState.checking
              ? 'Checking your email link...'
              : oobState.error || oobState.completedMessage}
          </p>
          {!oobState.checking && !oobState.error && !oobState.actionApplied && (
            <button
              type="button"
              disabled={submittingAuth}
              onClick={handleConfirmEmailAction}
              className="mt-4 inline-flex min-h-11 items-center justify-center bg-[#0A264A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#061830] disabled:opacity-60"
            >
              {submittingAuth
                ? 'Confirming…'
                : oobState.mode === 'verifyAndChangeEmail'
                ? 'Confirm email change'
                : 'Verify my email'}
            </button>
          )}
        </div>
      )}

      {oobState.mode === 'resetPassword' && (
        <div className="bg-white border border-[#D5CCB9] rounded-sm p-6 sm:p-8 max-w-lg mx-auto space-y-4">
          <div className="flex items-center gap-2.5 text-[#0A264A]">
            <KeyRound className="w-5 h-5" />
            <h2 className="font-display text-2xl font-semibold text-[#171A21]">
              Set a New Password
            </h2>
          </div>
          {oobState.checking ? (
            <p className="text-sm text-[#4A505C]">Validating your password reset link...</p>
          ) : oobState.completedMessage ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-sm text-sm">
              {oobState.completedMessage}
            </div>
          ) : oobState.error && !oobState.verifiedEmailForReset ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-sm text-sm">
              {oobState.error}
            </div>
          ) : (
            <form onSubmit={handleConfirmOobReset} className="space-y-4">
              <p className="text-xs text-[#4A505C]">
                Resetting password for{' '}
                <strong className="text-[#171A21]">{oobState.verifiedEmailForReset}</strong>
              </p>
              {oobState.error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-sm">
                  {oobState.error}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showOobPassword ? 'text' : 'password'}
                    required
                    value={newOobPassword}
                    onChange={(e) => setNewOobPassword(e.target.value)}
                    className="w-full pr-10 px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                    placeholder="At least 8 chars, upper, lower, number"
                  />
                  <button
                    type="button"
                    aria-label={showOobPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowOobPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6D7380] hover:text-[#171A21] p-1"
                  >
                    {showOobPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Confirm New Password
                </label>
                <input
                  type={showOobPassword ? 'text' : 'password'}
                  required
                  value={confirmOobPassword}
                  onChange={(e) => setConfirmOobPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submittingAuth}
                className="w-full py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm disabled:opacity-60"
              >
                {submittingAuth ? 'Updating Password...' : 'Confirm New Password'}
              </button>
            </form>
          )}
        </div>
      )}

      {!firebaseUser && !oobState.verifiedEmailForReset ? (
        <div className="bg-white border border-[#D5CCB9] rounded-sm p-6 sm:p-10 max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <UserCheck className="w-9 h-9 text-[#0A264A] mx-auto" strokeWidth={1.5} />
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#171A21]">
              {authView === 'register'
                ? 'Create Your Jeneconk Account'
                : authView === 'forgot'
                ? 'Reset Your Password'
                : 'Sign In to Your Account'}
            </h1>
            <p className="text-sm text-[#4A505C]">
              Access protected digital downloads, track support cases, and manage your profile with email &amp; password or Google.
            </p>
          </div>

          {authView !== 'forgot' && (
            <div className="grid grid-cols-2 border border-[#D5CCB9] rounded-sm p-1 bg-[#FAF8F4]">
              <button
                type="button"
                onClick={() => {
                  setAuthView('signin');
                  setAuthFeedback(null);
                  clearAuthError();
                }}
                className={`py-2 text-xs font-semibold uppercase tracking-[0.12em] rounded-sm transition-colors ${
                  authView === 'signin'
                    ? 'bg-[#0A264A] text-[#FAF8F4]'
                    : 'text-[#4A505C] hover:text-[#171A21]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthView('register');
                  setAuthFeedback(null);
                  clearAuthError();
                }}
                className={`py-2 text-xs font-semibold uppercase tracking-[0.12em] rounded-sm transition-colors ${
                  authView === 'register'
                    ? 'bg-[#0A264A] text-[#FAF8F4]'
                    : 'text-[#4A505C] hover:text-[#171A21]'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {(authFeedback || authError) && (
            <div
              role="alert"
              className={`border text-xs sm:text-sm px-4 py-3 rounded-sm ${
                authFeedback?.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {authFeedback?.text || authError}
            </div>
          )}

          {authView === 'signin' && (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#4A505C]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(loginEmail);
                      setAuthView('forgot');
                      setAuthFeedback(null);
                      clearAuthError();
                    }}
                    className="text-xs font-medium text-[#0A264A] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pr-10 px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                  />
                  <button
                    type="button"
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowLoginPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6D7380] hover:text-[#171A21] p-1"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#4A505C]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Keep me signed in on this device</span>
              </label>

              <button
                type="submit"
                disabled={submittingAuth}
                className="w-full py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm min-h-[44px] disabled:opacity-60"
              >
                {submittingAuth ? 'Signing In...' : 'Sign In with Email'}
              </button>
            </form>
          )}

          {authView === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Chinedu Okafor"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pr-10 px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                  />
                  <button
                    type="button"
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowRegPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6D7380] hover:text-[#171A21] p-1"
                  >
                    {showRegPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Clear Password Requirements & Strength Bar */}
                <div className="mt-2 space-y-1.5">
                  <div className="grid grid-cols-4 gap-1 h-1">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`rounded-full ${
                          pwEval.passed >= step
                            ? pwEval.strongEnough
                              ? 'bg-emerald-600'
                              : 'bg-amber-500'
                            : 'bg-[#E4DDD0]'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-[#4A505C]">
                    <span className={pwEval.checks.length ? 'text-emerald-700 font-medium' : ''}>
                      {pwEval.checks.length ? '✓' : '○'} 8+ characters
                    </span>
                    <span className={pwEval.checks.upper ? 'text-emerald-700 font-medium' : ''}>
                      {pwEval.checks.upper ? '✓' : '○'} Uppercase letter
                    </span>
                    <span className={pwEval.checks.lower ? 'text-emerald-700 font-medium' : ''}>
                      {pwEval.checks.lower ? '✓' : '○'} Lowercase letter
                    </span>
                    <span className={pwEval.checks.number ? 'text-emerald-700 font-medium' : ''}>
                      {pwEval.checks.number ? '✓' : '○'} Number (0-9)
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showRegConfirm ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pr-10 px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                  />
                  <button
                    type="button"
                    aria-label={showRegConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    onClick={() => setShowRegConfirm((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6D7380] hover:text-[#171A21] p-1"
                  >
                    {showRegConfirm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {regConfirm && regPassword !== regConfirm && (
                  <p className="text-[11px] text-rose-700 mt-1">Passwords do not match.</p>
                )}
              </div>

              <label className="flex items-start gap-2 text-xs text-[#4A505C] leading-relaxed">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I accept the{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/terms')}
                    className="text-[#0A264A] underline"
                  >
                    Terms &amp; Conditions
                  </button>{' '}
                  and{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/privacy')}
                    className="text-[#0A264A] underline"
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={submittingAuth}
                className="w-full py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm min-h-[44px] disabled:opacity-60"
              >
                {submittingAuth ? 'Creating Account...' : 'Create Customer Account'}
              </button>
            </form>
          )}

          {authView === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <p className="text-xs text-[#4A505C] leading-relaxed">
                Enter the email address registered with your account. Firebase Authentication will dispatch a secure single-use reset link.
              </p>
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Account Email Address
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submittingAuth}
                className="w-full py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm min-h-[44px] disabled:opacity-60"
              >
                {submittingAuth ? 'Sending Reset Link...' : 'Send Password Reset Link'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthView('signin');
                  setAuthFeedback(null);
                }}
                className="w-full py-2 text-xs font-medium text-[#4A505C] hover:text-[#171A21]"
              >
                Back to Sign In
              </button>
            </form>
          )}

          {authView !== 'forgot' && (
            <>
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-[#E4DDD0]" />
                <span className="shrink mx-3 text-[11px] uppercase tracking-[0.16em] text-[#6D7380]">
                  Or
                </span>
                <div className="flex-grow border-t border-[#E4DDD0]" />
              </div>

              <button
                type="button"
                onClick={() => signInWithGoogle(rememberMe)}
                className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#171A21] bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm min-h-[44px]"
              >
                <span>Continue with Google</span>
              </button>
            </>
          )}

          <p className="text-xs text-[#6D7380] text-center pt-1">
            Purchases completed externally on Selar are delivered directly via your Selar account and receipt email.
          </p>
        </div>
      ) : firebaseUser ? (
        <div className="space-y-6">
          {/* Top Customer Account Header */}
          <div className="bg-white border border-[#D5CCB9] rounded-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#171A21]">
                  {customerFirstName ? `Welcome, ${customerFirstName}` : 'Customer Dashboard'}
                </h1>
                {firebaseUser.emailVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-sm">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified Email
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-sm">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Unverified Email
                  </span>
                )}
                {profile && isConsoleAuthorized && (
                  <span className="px-2 py-0.5 text-[11px] font-mono bg-[#0A264A] text-white rounded-sm">
                    {ROLE_LABELS[profile.role] || profile.role}
                  </span>
                )}
              </div>
              <p className="text-sm text-[#4A505C] mt-1">
                Signed in as{' '}
                <span className="font-medium text-[#171A21]">{firebaseUser.email}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {isConsoleAuthorized && (
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm min-h-[40px]"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Open Operations Console</span>
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#171A21] bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm min-h-[40px]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Account Suspension Banner */}
          {profile?.accountStatus === 'suspended' && (
            <div className="bg-rose-50 border border-rose-300 rounded-sm p-5 text-rose-900 space-y-1">
              <p className="text-sm font-semibold">Your Account is Currently Suspended</p>
              <p className="text-xs leading-relaxed">
                {profile.suspendedReason ||
                  'Access to protected downloads and account updates has been paused by Jeneconk Support.'}{' '}
                Contact{' '}
                <a href="mailto:info@jeneconk.com" className="underline font-medium">
                  info@jeneconk.com
                </a>{' '}
                for assistance.
              </p>
            </div>
          )}

          {/* Unverified Email Banner */}
          {!firebaseUser.emailVerified && (
            <div className="bg-amber-50 border border-amber-200 rounded-sm p-5 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-950 font-semibold text-sm">
                  <MailCheck className="w-4 h-4" />
                  <span>Verify Your Email Address</span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  We sent the link to <strong>{firebaseUser.email}</strong>. Check that this address is correct. Until it is verified, order history, support requests, protected downloads and admin access are unavailable.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await resendVerificationEmail();
                    setStatusMessage(r.message || null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#0A264A] text-white rounded-sm hover:bg-[#061830]"
                >
                  Resend Verification Email
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const verified = await refreshAccountProfile();
                      setStatusMessage(
                        verified
                          ? `Email verified for ${firebaseUser.email || 'your account'}. You’re all set.`
                          : `We still don’t see verification for ${firebaseUser.email || 'this account'}. Open the newest email link or resend the verification email.`
                      );
                    } catch {
                      setStatusMessage('We could not refresh your email status. Please try again.');
                    }
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-white border border-amber-300 text-amber-950 rounded-sm hover:bg-amber-100"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>I&apos;ve Verified</span>
                </button>
              </div>
              <form onSubmit={handleEmailCorrection} className="grid grid-cols-1 gap-2 border-t border-amber-200 pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <label htmlFor="corrected-account-email" className="mb-1 block text-xs font-semibold text-amber-950">
                    Email entered incorrectly?
                  </label>
                  <input
                    id="corrected-account-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={correctedEmail}
                    onChange={(event) => setCorrectedEmail(event.target.value)}
                    placeholder="Enter the correct email address"
                    className="w-full border border-amber-300 bg-white px-3.5 py-2.5 text-sm text-[#171A21] focus:outline-none focus:ring-2 focus:ring-[#0A264A]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={requestingEmailChange}
                  className="inline-flex min-h-11 items-center justify-center border border-[#0A264A] bg-white px-4 py-2.5 text-xs font-semibold text-[#0A264A] hover:bg-amber-100 disabled:opacity-60"
                >
                  {requestingEmailChange ? 'Sending…' : 'Change email securely'}
                </button>
              </form>
            </div>
          )}

          {marketplaceNotice && (
            <div className="bg-[#F3EEE4] border border-[#D5CCB9] rounded-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs sm:text-sm text-[#4A505C] leading-relaxed">
                {marketplaceNotice}
              </p>
              <a
                href="https://selar.co"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A264A] hover:underline whitespace-nowrap shrink-0"
              >
                <span>Open Selar</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {accountError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3 rounded-sm flex items-center justify-between gap-3">
              <span>{accountError}</span>
              <button
                type="button"
                onClick={loadAccountData}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-sm"
              >
                Retry
              </button>
            </div>
          )}

          {statusMessage && (
            <div role="status" aria-live="polite" className="bg-[#0A264A] text-[#FAF8F4] text-sm px-4 py-3 rounded-sm">
              {statusMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Profile, Security & Account Activity */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-[#E4DDD0] rounded-sm p-6 space-y-4">
                <h2 className="font-display text-xl font-semibold text-[#171A21]">
                  Profile &amp; Account Security
                </h2>
                <form onSubmit={handleSaveName} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[#4A505C] mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A505C] mb-1">
                      Account Email
                    </label>
                    <input
                      type="text"
                      disabled
                      value={firebaseUser.email || ''}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F3EEE4] text-[#6D7380] border border-[#E4DDD0] rounded-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingName || profile?.accountStatus === 'suspended'}
                    className="px-4 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm disabled:opacity-50"
                  >
                    {savingName ? 'Saving...' : 'Save Profile'}
                  </button>
                </form>

                <div className="pt-4 border-t border-[#EDE7DA] space-y-2.5">
                  <p className="text-xs font-semibold text-[#171A21]">Session &amp; Password Controls</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!firebaseUser.email) return;
                        const r = await sendPasswordReset(firebaseUser.email);
                        setStatusMessage(r.message || 'Password reset link requested.');
                      }}
                      className="px-3 py-2 text-xs font-medium bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm"
                    >
                      Email Password Reset Link
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await invalidateOtherSessions('customer_requested');
                        setStatusMessage(r.message || null);
                        loadAccountData();
                      }}
                      className="px-3 py-2 text-xs font-medium bg-[#FAF8F4] border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm"
                    >
                      Sign Out Older Sessions
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#E4DDD0] rounded-sm p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#0A264A]" />
                  <h2 className="font-display text-lg font-semibold text-[#171A21]">
                    Recent Account Activity
                  </h2>
                </div>
                {activityTimeline.length === 0 ? (
                  <p className="text-xs text-[#6D7380]">No recent activity logged yet.</p>
                ) : (
                  <ul className="space-y-2.5 text-xs max-h-64 overflow-y-auto pr-1">
                    {activityTimeline.map((ev) => (
                      <li
                        key={ev.id}
                        className="border-b border-[#EDE7DA] pb-2 flex items-start justify-between gap-3"
                      >
                        <div>
                          <span className="font-mono font-semibold text-[#171A21] uppercase">
                            {ev.eventType.replace(/_/g, ' ')}
                          </span>
                          {ev.details && <p className="text-[#4A505C] mt-0.5">{ev.details}</p>}
                        </div>
                        <span className="text-[#6D7380] font-mono shrink-0">
                          {new Date(ev.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Column: Orders, Protected Downloads & Support Cases */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white border border-[#E4DDD0] rounded-sm p-6">
                <h2 className="font-display text-xl font-semibold text-[#171A21] mb-4">
                  Native Store Orders &amp; Protected Downloads
                </h2>

                {loadingAccount ? (
                  <p className="text-sm text-[#6D7380]">Loading order history...</p>
                ) : orders.length === 0 ? (
                  <p className="text-sm text-[#4A505C]">
                    You have no native store orders yet. Purchases completed through Selar are accessed directly in your Selar library.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="border border-[#E4DDD0] rounded-sm p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-semibold text-[#171A21]">
                            {ord.orderReference}
                          </span>
                          <span className="text-[#6D7380]">
                            {new Date(ord.createdAt).toLocaleDateString()} ·{' '}
                            <span className="uppercase font-medium text-[#171A21]">
                              {ord.paymentStatus}
                            </span>{' '}
                            ·{' '}
                            <span className="font-mono tabular-nums">
                              {formatMinorPrice(ord.totalMinor, ord.currency)}
                            </span>
                          </span>
                        </div>
                        <div className="space-y-2 pt-2 border-t border-[#EDE7DA]">
                          {ord.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-4 text-sm"
                            >
                              <div>
                                <p className="font-medium text-[#171A21]">
                                  {item.productName}
                                </p>
                                <p className="text-xs text-[#6D7380] font-mono tabular-nums">
                                  v{item.productVersion} · Downloads: {item.downloadCount}/
                                  {item.maxDownloads}
                                </p>
                              </div>
                              {ord.paymentStatus === 'paid' && (
                                <button
                                  type="button"
                                  disabled={profile?.accountStatus === 'suspended'}
                                  onClick={() => handleDownload(item.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm shrink-0 disabled:opacity-50"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-[#E4DDD0] rounded-sm p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-[#0A264A]" />
                    <h2 className="font-display text-xl font-semibold text-[#171A21]">
                      Support Cases ({supportCases.length})
                    </h2>
                  </div>
                  <button
                    type="button"
                    disabled={profile?.accountStatus === 'suspended'}
                    onClick={() => setShowNewCaseForm((v) => !v)}
                    className="px-3.5 py-2 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm disabled:opacity-50"
                  >
                    {showNewCaseForm ? 'Cancel' : 'Open Support Case'}
                  </button>
                </div>

                {showNewCaseForm && (
                  <form
                    onSubmit={handleCreateSupportCase}
                    className="bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm p-4 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#4A505C] mb-1">
                          Issue Category
                        </label>
                        <select
                          value={caseCategory}
                          onChange={(e) => setCaseCategory(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#D5CCB9] rounded-sm"
                        >
                          <option value="paid_no_access">Paid Checkout / Missing Access</option>
                          <option value="broken_download">Broken or Expired Download Link</option>
                          <option value="missing_product">Product Missing From Account</option>
                          <option value="duplicate_tx">Duplicate Transaction / Order Issue</option>
                          <option value="email_verification">Verification / Password Help</option>
                          <option value="general_enquiry">General Assistance</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#4A505C] mb-1">
                          Order / Transaction Ref (Optional)
                        </label>
                        <input
                          type="text"
                          value={caseTxRef}
                          onChange={(e) => setCaseTxRef(e.target.value)}
                          placeholder="e.g. JNK-... or Selar ref"
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#D5CCB9] rounded-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#4A505C] mb-1">
                          Related Product (Optional)
                        </label>
                        <select
                          value={caseProduct}
                          onChange={(e) => setCaseProduct(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#D5CCB9] rounded-sm"
                        >
                          <option value="">Not product-specific</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.slug}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#4A505C] mb-1">
                          Subject
                        </label>
                        <input
                          type="text"
                          required
                          value={caseSubject}
                          onChange={(e) => setCaseSubject(e.target.value)}
                          placeholder="Brief summary of the issue"
                          className="w-full px-3 py-2 text-xs bg-white border border-[#D5CCB9] rounded-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#4A505C] mb-1">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={caseDescription}
                        onChange={(e) => setCaseDescription(e.target.value)}
                        placeholder="Describe what happened so support can assist quickly..."
                        className="w-full px-3 py-2 text-xs bg-white border border-[#D5CCB9] rounded-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingCase}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] rounded-sm disabled:opacity-60"
                    >
                      {submittingCase ? 'Submitting...' : 'Submit Case'}
                    </button>
                  </form>
                )}

                {supportCases.length === 0 && enquiries.length === 0 ? (
                  <p className="text-sm text-[#4A505C]">
                    No support cases opened under this account.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {supportCases.map((sc) => (
                      <div
                        key={sc.id}
                        className="border border-[#E4DDD0] rounded-sm p-4 space-y-1.5 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-[#0A264A]">
                            {sc.caseReference}
                          </span>
                          <span className="text-xs font-mono uppercase px-2 py-0.5 rounded-sm bg-[#FAF8F4] border border-[#D5CCB9] text-[#171A21]">
                            {sc.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="font-medium text-[#171A21]">{sc.subject}</p>
                        <p className="text-xs text-[#4A505C]">{sc.description}</p>
                        {sc.resolutionSummary && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-sm p-2.5 text-xs text-emerald-950">
                            <strong>Resolution Note:</strong> {sc.resolutionSummary}
                          </div>
                        )}
                      </div>
                    ))}
                    {enquiries.length > 0 && supportCases.length === 0 && (
                      <ul className="space-y-2 text-sm">
                        {enquiries.map((enq) => (
                          <li
                            key={enq.id}
                            className="flex items-center justify-between gap-4 border-b border-[#EDE7DA] pb-2"
                          >
                            <span className="font-medium text-[#171A21]">{enq.subject}</span>
                            <span className="text-xs font-mono text-[#6D7380] uppercase">
                              {enq.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
