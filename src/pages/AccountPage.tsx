import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  LogOut,
  Shield,
  UserCheck,
} from 'lucide-react';
import { SeoHead } from '../components/SeoHead';
import { useStore } from '../context/StoreContext';
import { formatMinorPrice } from '../lib/format';
import type { CurrencyCode } from '../types/store';

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
  createdAt: string;
  items: OrderItemRecord[];
}

interface EnquiryRecord {
  id: number;
  subject: string;
  status: string;
  createdAt: string;
}

export function AccountPage() {
  const {
    firebaseUser,
    profile,
    authLoading,
    authError,
    signInWithGoogle,
    signOut,
    getAuthHeaders,
    navigate,
    clearCart,
  } = useStore();

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [marketplaceNotice, setMarketplaceNotice] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState<any>(null);

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
        .then((r) => r.json())
        .then((data) => {
          if (data.verified) {
            setVerifiedReceipt(data);
            clearCart();
            loadAccountData();
          }
        })
        .catch(() => {});
    }
  }, [clearCart, loadAccountData]);

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

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="h-40 bg-white border border-[#E4DDD0] rounded-sm animate-pulse" />
      </div>
    );
  }

  return (
    <div className="py-12 sm:py-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      <SeoHead
        title="Customer Account | Jeneconk Digital Store"
        description="Access your Jeneconk Digital Store profile, native orders, protected digital downloads, and support enquiries."
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

      {!firebaseUser ? (
        <div className="bg-white border border-[#D5CCB9] rounded-sm p-8 sm:p-12 max-w-2xl mx-auto text-center space-y-5">
          <UserCheck className="w-10 h-10 text-[#0A264A] mx-auto" strokeWidth={1.5} />
          <h1 className="font-display text-3xl font-semibold text-[#171A21]">
            Sign In to Your Jeneconk Account
          </h1>
          <p className="text-sm sm:text-base text-[#4A505C] leading-relaxed">
            Sign in securely with Google to manage your customer profile, track support enquiries, access native digital downloads, or open Store Administration if authorised.
          </p>
          {authError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm px-4 py-3 rounded-sm text-left">
              {authError}
            </div>
          )}
          <button
            type="button"
            onClick={signInWithGoogle}
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm min-h-[46px]"
          >
            <span>Continue with Google</span>
          </button>
          <p className="text-xs text-[#6D7380] pt-2">
            Note: Purchases completed externally on Selar are delivered directly via your Selar account and receipt email.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-white border border-[#D5CCB9] rounded-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#171A21]">
                Customer Dashboard
              </h1>
              <p className="text-sm text-[#4A505C] mt-1">
                Signed in as <span className="font-medium text-[#171A21]">{firebaseUser.email}</span>
                {profile?.role === 'admin' && ' · Administrator Access Active'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {profile?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm min-h-[40px]"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Open Admin Dashboard</span>
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
            <div className="bg-[#0A264A] text-[#FAF8F4] text-sm px-4 py-3 rounded-sm">
              {statusMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Profile Settings */}
            <div className="lg:col-span-5 bg-white border border-[#E4DDD0] rounded-sm p-6 space-y-4 h-fit">
              <h2 className="font-display text-xl font-semibold text-[#171A21]">
                Account Settings
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
                    Verified Email
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
                  disabled={savingName}
                  className="px-4 py-2.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm"
                >
                  {savingName ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            </div>

            {/* Native Store Orders & Downloads */}
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
                                  v{item.productVersion} · Downloads: {item.downloadCount}/{item.maxDownloads}
                                </p>
                              </div>
                              {ord.paymentStatus === 'paid' && (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(item.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm shrink-0"
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

              <div className="bg-white border border-[#E4DDD0] rounded-sm p-6">
                <h2 className="font-display text-xl font-semibold text-[#171A21] mb-4">
                  Support Enquiries
                </h2>
                {enquiries.length === 0 ? (
                  <p className="text-sm text-[#4A505C]">
                    No support enquiries submitted under this account.
                  </p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {enquiries.map((enq) => (
                      <li
                        key={enq.id}
                        className="flex items-center justify-between gap-4 border-b border-[#EDE7DA] pb-2.5"
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
