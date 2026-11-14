import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { formatMinorPrice } from '../../lib/format';
import type { AdminPermission } from '../../lib/rbac';

interface AdminOrdersTabProps {
  orders: any[];
  nativeCheckoutActive: boolean;
  hasPermission: (p: AdminPermission) => boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onToast: (msg: string) => void;
  onRefresh: () => Promise<void>;
  onExportCsv: () => void;
  onRequireReauth: (retry: () => Promise<void>) => void;
}

export function AdminOrdersTab({
  orders,
  nativeCheckoutActive,
  hasPermission,
  getAuthHeaders,
  onToast,
  onRefresh,
  onExportCsv,
  onRequireReauth,
}: AdminOrdersTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [destFilter, setDestFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [reassignEmail, setReassignEmail] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canManageOrders = hasPermission('manage_orders');
  const canReassignOrders = hasPermission('reassign_orders');

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.paymentStatus !== statusFilter) return false;
      if (destFilter !== 'all' && (o.checkoutDestination || 'native') !== destFilter)
        return false;
      if (q) {
        const itemNames = (o.items || []).map((i: any) => i.productName).join(' ');
        const hay = `${o.orderReference} ${o.customerEmail} ${o.customerName || ''} ${itemNames}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, destFilter]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const handleVerifyPaystack = async (orderId: number) => {
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/orders/${orderId}/verify-paystack`, {
        method: 'POST',
        headers,
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Unable to verify via Paystack.');
        return;
      }
      onToast(
        json.verified
          ? 'Paystack verified payment and fulfilled order.'
          : `Paystack status: ${json.paystackStatus || 'not paid'}`
      );
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleReassignOrder = async () => {
    if (!selectedOrder) return;
    if (!reassignEmail.trim() || !reassignReason.trim()) {
      onToast('Provide both a verified target email and an audit reason.');
      return;
    }
    const execute = async () => {
      setBusy(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch(`/api/admin/orders/${selectedOrder.id}/reassign`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            targetEmail: reassignEmail.trim(),
            reason: reassignReason.trim(),
          }),
        });
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          onRequireReauth(execute);
          return;
        }
        if (!res.ok) {
          onToast(json.error || 'Unable to reassign order.');
          return;
        }
        setReassignEmail('');
        setReassignReason('');
        onToast(`Reassigned ${selectedOrder.orderReference}.`);
        await onRefresh();
      } finally {
        setBusy(false);
      }
    };
    await execute();
  };

  const handleRefundOrder = async (orderId: number) => {
    const execute = async () => {
      setBusy(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason: 'Recorded by Finance/Admin operations' }),
        });
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          onRequireReauth(execute);
          return;
        }
        if (!res.ok) {
          onToast(json.error || 'Unable to record refund.');
          return;
        }
        onToast('Order marked refunded.');
        await onRefresh();
      } finally {
        setBusy(false);
      }
    };
    await execute();
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#FAF8F4] border border-[#D5CCB9] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div>
          <span className="font-semibold text-slate-900">
            Checkout Architecture Distinction:
          </span>{' '}
          <span className="text-slate-700">
            {nativeCheckoutActive
              ? 'Native Paystack checkout is active alongside Selar product links.'
              : 'Stage 1 active — paid checkouts route externally to Selar. Only local/native orders or Paystack transactions appear below; Selar seller payouts and receipts are managed in Selar.'}
          </span>
        </div>
        <a
          href="https://selar.co"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-[#0A264A] hover:underline shrink-0"
        >
          <span>Selar Dashboard</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by reference, email, or product..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#D5CCB9] rounded-lg"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-[#D5CCB9] rounded-lg"
          >
            <option value="all">All Payment States</option>
            <option value="paid">Verified Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <select
            value={destFilter}
            onChange={(e) => setDestFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-[#D5CCB9] rounded-lg"
          >
            <option value="all">All Destinations</option>
            <option value="native">Native Store</option>
            <option value="selar">Selar Checkout</option>
          </select>
          {hasPermission('export_reports') && (
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold bg-white border border-[#D5CCB9] hover:bg-slate-50 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Orders CSV</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div
          className={`${
            selectedOrder ? 'xl:col-span-7' : 'xl:col-span-12'
          } bg-white border border-[#E4DDD0] rounded-xl overflow-x-auto`}
        >
          {filteredOrders.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">
              No local native order records match the active filters.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-[#E4DDD0] bg-slate-50">
                  <th className="p-3.5">Reference</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Payment</th>
                  <th className="p-3.5">Fulfilment</th>
                  <th className="p-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((o) => (
                  <tr key={o.id} className={selectedOrderId === o.id ? 'bg-[#FAF8F4]' : ''}>
                    <td className="p-3.5 font-mono text-xs font-semibold text-slate-900">
                      {o.orderReference}
                    </td>
                    <td className="p-3.5 text-xs text-slate-700">{o.customerEmail}</td>
                    <td className="p-3.5 font-mono text-xs tabular-nums">
                      {formatMinorPrice(o.totalMinor, o.currency)}
                    </td>
                    <td className="p-3.5 text-xs uppercase font-medium">
                      {o.paymentStatus}
                    </td>
                    <td className="p-3.5 text-xs uppercase text-slate-600">
                      {o.fulfilmentStatus || 'pending'}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(o.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-[#0A264A] bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedOrder && (
          <div className="xl:col-span-5 bg-white border border-[#D5CCB9] rounded-xl p-5 space-y-4 text-xs">
            <div className="flex items-start justify-between gap-2 border-b border-[#E4DDD0] pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Transaction {selectedOrder.orderReference}
                </h3>
                <p className="text-slate-500">
                  {new Date(selectedOrder.createdAt).toLocaleString()} · Destination:{' '}
                  {selectedOrder.checkoutDestination || 'native'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-[#FAF8F4] border border-[#E4DDD0] rounded-lg p-3">
              <div>
                <span className="text-slate-500 block">Payment</span>
                <span className="font-mono font-semibold uppercase">
                  {selectedOrder.paymentStatus}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Order</span>
                <span className="font-mono font-semibold uppercase">
                  {selectedOrder.orderStatus || 'created'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Fulfilment</span>
                <span className="font-mono font-semibold uppercase">
                  {selectedOrder.fulfilmentStatus || 'pending'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="font-semibold text-slate-900">Purchased Line Items</p>
              {(selectedOrder.items || []).map((item: any) => (
                <div
                  key={item.id}
                  className="flex justify-between border border-slate-100 rounded p-2"
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.productName}</p>
                    <p className="text-slate-500 font-mono">
                      Downloads: {item.downloadCount}/{item.maxDownloads}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums">
                    {formatMinorPrice(item.unitPriceMinor, selectedOrder.currency)}
                  </span>
                </div>
              ))}
            </div>

            {canManageOrders && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E4DDD0]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleVerifyPaystack(selectedOrder.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold bg-slate-100 hover:bg-slate-200 text-[#0A264A] rounded-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Verify via Paystack</span>
                </button>
                {selectedOrder.paymentStatus === 'paid' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRefundOrder(selectedOrder.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-md"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Record Refund</span>
                  </button>
                )}
              </div>
            )}

            {canReassignOrders && (
              <div className="pt-3 border-t border-[#E4DDD0] space-y-2">
                <p className="font-semibold text-slate-900">
                  Reassign Order to Verified Customer Account
                </p>
                <input
                  type="email"
                  value={reassignEmail}
                  onChange={(e) => setReassignEmail(e.target.value)}
                  placeholder="Verified customer email..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                />
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Required audit reason..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReassignOrder}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-[#0A264A] rounded-md"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Reassign Order</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
