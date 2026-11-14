import React, { useMemo, useState } from 'react';
import {
  KeyRound,
  LogOut,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { ROLE_LABELS, type AdminPermission } from '../../lib/rbac';
import type { AccountEventRecord, SupportCaseRecord } from '../../types/store';

export interface AdminCustomerSummary {
  id: number;
  uid: string;
  email: string;
  fullName: string | null;
  role: string;
  accountStatus: 'active' | 'suspended';
  emailVerified: boolean;
  authProvider: string;
  linkedUidsCount: number;
  lastLoginAt: string | null;
  lastPasswordResetAt: string | null;
  sessionInvalidatedBefore: string | null;
  suspendedReason: string | null;
  internalNotes: string | null;
  createdAt: string;
  orderCount: number;
  paidOrderCount: number;
}

interface AdminCustomersTabProps {
  customers: AdminCustomerSummary[];
  availableRoles: { value: string; label: string }[];
  hasPermission: (p: AdminPermission) => boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onToast: (msg: string) => void;
  onRefresh: () => Promise<void>;
  onRequireReauth: (retry: () => Promise<void>) => void;
}

export function AdminCustomersTab({
  customers,
  availableRoles,
  hasPermission,
  getAuthHeaders,
  onToast,
  onRefresh,
  onRequireReauth,
}: AdminCustomersTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'unverified' | 'staff'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    customer: AdminCustomerSummary;
    orders: any[];
    downloads: any[];
    activityTimeline: AccountEventRecord[];
    supportCases: SupportCaseRecord[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [notesDraft, setNotesDraft] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [roleReason, setRoleReason] = useState('');
  const [roleDraft, setRoleDraft] = useState('customer');
  const [actionBusy, setActionBusy] = useState(false);

  const canManageSupport = hasPermission('manage_customers_support');
  const canManageRoles = hasPermission('manage_roles');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (statusFilter === 'active' && c.accountStatus !== 'active') return false;
      if (statusFilter === 'suspended' && c.accountStatus !== 'suspended') return false;
      if (statusFilter === 'unverified' && c.emailVerified) return false;
      if (statusFilter === 'staff' && c.role === 'customer') return false;
      if (q) {
        const hay = `${c.email} ${c.fullName || ''} ${c.role}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [customers, search, statusFilter]);

  const loadDetail = async (id: number) => {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/customers/${id}`, { headers });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Unable to load customer profile.');
        return;
      }
      setDetail(json);
      setNotesDraft(json.customer?.internalNotes || '');
      setRoleDraft(json.customer?.role || 'customer');
    } catch {
      onToast('Network error loading customer details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleSuspension = async (nextStatus: 'active' | 'suspended') => {
    if (!detail) return;
    if (nextStatus === 'suspended' && !suspendReason.trim()) {
      onToast('Enter a reason before suspending this account.');
      return;
    }
    const execute = async () => {
      setActionBusy(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch(`/api/admin/customers/${detail.customer.id}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            accountStatus: nextStatus,
            reason:
              nextStatus === 'suspended'
                ? suspendReason.trim()
                : 'Reactivated by support operations',
          }),
        });
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          onRequireReauth(execute);
          return;
        }
        if (!res.ok) {
          onToast(json.error || 'Unable to update status.');
          return;
        }
        setSuspendReason('');
        onToast(`Account ${detail.customer.email} set to ${nextStatus}.`);
        await Promise.all([loadDetail(detail.customer.id), onRefresh()]);
      } finally {
        setActionBusy(false);
      }
    };
    await execute();
  };

  const handleSaveNotes = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch(`/api/admin/customers/${detail.customer.id}/notes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ internalNotes: notesDraft }),
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Unable to save internal notes.');
        return;
      }
      onToast('Customer notes saved.');
      await loadDetail(detail.customer.id);
    } finally {
      setActionBusy(false);
    }
  };

  const handleTriggerReset = async () => {
    if (!detail) return;
    const execute = async () => {
      setActionBusy(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch(
          `/api/admin/customers/${detail.customer.id}/trigger-password-reset`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ reason: 'Support triggered password reset' }),
          }
        );
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          onRequireReauth(execute);
          return;
        }
        if (!res.ok) {
          onToast(json.error || 'Unable to send password reset.');
          return;
        }
        onToast(json.message);
        await loadDetail(detail.customer.id);
      } finally {
        setActionBusy(false);
      }
    };
    await execute();
  };

  const handleRevokeSessions = async () => {
    if (!detail) return;
    const execute = async () => {
      setActionBusy(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch(
          `/api/admin/customers/${detail.customer.id}/revoke-sessions`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ reason: 'Operations security session revocation' }),
          }
        );
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          onRequireReauth(execute);
          return;
        }
        if (!res.ok) {
          onToast(json.error || 'Unable to revoke sessions.');
          return;
        }
        onToast(`Active sessions invalidated for ${detail.customer.email}.`);
        await loadDetail(detail.customer.id);
      } finally {
        setActionBusy(false);
      }
    };
    await execute();
  };

  const handleRoleUpdate = async () => {
    if (!detail) return;
    const execute = async () => {
      setActionBusy(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch(`/api/admin/customers/${detail.customer.id}/role`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            role: roleDraft,
            reason: roleReason.trim() || 'Super Admin role assignment',
          }),
        });
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          onRequireReauth(execute);
          return;
        }
        if (!res.ok) {
          onToast(json.error || 'Unable to update role.');
          return;
        }
        setRoleReason('');
        onToast(`Updated role for ${detail.customer.email} to ${roleDraft}.`);
        await Promise.all([loadDetail(detail.customer.id), onRefresh()]);
      } finally {
        setActionBusy(false);
      }
    };
    await execute();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by email, name, or role..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#D5CCB9] rounded-lg"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {(
            [
              ['all', `All (${customers.length})`],
              ['active', 'Active'],
              ['suspended', 'Suspended'],
              ['unverified', 'Unverified'],
              ['staff', 'Operations Staff'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1.5 rounded-lg font-medium border ${
                statusFilter === val
                  ? 'bg-[#0A264A] text-white border-[#0A264A]'
                  : 'bg-white text-slate-700 border-[#E4DDD0] hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div
          className={`${
            selectedId ? 'xl:col-span-7' : 'xl:col-span-12'
          } bg-white border border-[#E4DDD0] rounded-xl overflow-x-auto`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-[#E4DDD0] bg-slate-50">
                <th className="p-3.5">Account</th>
                <th className="p-3.5">Verification</th>
                <th className="p-3.5">Provider</th>
                <th className="p-3.5">Role</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Orders</th>
                <th className="p-3.5 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-slate-500">
                    No customer accounts match the selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className={selectedId === c.id ? 'bg-[#FAF8F4]' : 'hover:bg-slate-50/70'}
                  >
                    <td className="p-3.5">
                      <div className="font-medium text-slate-900">{c.email}</div>
                      <div className="text-xs text-slate-500">{c.fullName || 'No name set'}</div>
                    </td>
                    <td className="p-3.5 text-xs">
                      {c.emailVerified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Unverified
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-xs text-slate-600">{c.authProvider}</td>
                    <td className="p-3.5 font-mono text-xs text-slate-800">{c.role}</td>
                    <td className="p-3.5 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded font-medium uppercase text-[10px] ${
                          c.accountStatus === 'suspended'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {c.accountStatus}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-mono text-xs tabular-nums">
                      {c.paidOrderCount}/{c.orderCount}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => loadDetail(c.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-[#0A264A] bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedId && (
          <div className="xl:col-span-5 bg-white border border-[#D5CCB9] rounded-xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-2 border-b border-[#E4DDD0] pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Customer Profile #{selectedId}
                </h3>
                {detail && (
                  <p className="text-xs text-slate-600">
                    {detail.customer.email} · Registered{' '}
                    {new Date(detail.customer.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingDetail || !detail ? (
              <p className="text-xs text-slate-500">Loading profile telemetry...</p>
            ) : (
              <div className="space-y-5 text-xs">
                <div className="grid grid-cols-2 gap-2.5 bg-[#FAF8F4] border border-[#E4DDD0] rounded-lg p-3">
                  <div>
                    <span className="text-slate-500 block">Name</span>
                    <span className="font-medium text-slate-900">
                      {detail.customer.fullName || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Role</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {ROLE_LABELS[detail.customer.role as keyof typeof ROLE_LABELS] ||
                        detail.customer.role}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Last Login</span>
                    <span className="font-mono text-slate-800">
                      {detail.customer.lastLoginAt
                        ? new Date(detail.customer.lastLoginAt).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Auth Provider</span>
                    <span className="font-mono text-slate-800">
                      {detail.customer.authProvider} ({detail.customer.linkedUidsCount} UID)
                    </span>
                  </div>
                </div>

                {canManageSupport && (
                  <div className="space-y-2.5 pt-1">
                    <p className="font-semibold text-slate-900">Safe Support &amp; Security Actions</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleTriggerReset}
                        className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-[#0A264A] bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Trigger Password Reset</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleRevokeSessions}
                        className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Revoke Sessions</span>
                      </button>
                    </div>

                    {detail.customer.accountStatus === 'active' ? (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={suspendReason}
                          onChange={(e) => setSuspendReason(e.target.value)}
                          placeholder="Suspension reason (preserves all records)..."
                          className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleToggleSuspension('suspended')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md shrink-0"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Suspend</span>
                        </button>
                      </div>
                    ) : (
                      <div className="bg-rose-50 border border-rose-200 rounded-md p-3 flex items-center justify-between gap-2">
                        <span className="text-rose-800">
                          Suspended: {detail.customer.suspendedReason || 'No reason noted'}
                        </span>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleToggleSuspension('active')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md shrink-0"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Reactivate</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {canManageRoles && (
                  <div className="pt-3 border-t border-[#E4DDD0] space-y-2">
                    <p className="font-semibold text-slate-900">Role Assignment (Super Admin)</p>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={roleDraft}
                        onChange={(e) => setRoleDraft(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                      >
                        {availableRoles.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={roleReason}
                        onChange={(e) => setRoleReason(e.target.value)}
                        placeholder="Audit reason..."
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-md"
                      />
                      <button
                        type="button"
                        disabled={actionBusy || roleDraft === detail.customer.role}
                        onClick={handleRoleUpdate}
                        className="px-3 py-1.5 font-semibold text-white bg-[#0A264A] rounded-md disabled:opacity-50"
                      >
                        Update Role
                      </button>
                    </div>
                  </div>
                )}

                {canManageSupport && (
                  <div className="pt-3 border-t border-[#E4DDD0] space-y-2">
                    <label className="block font-semibold text-slate-900">
                      Internal Support Notes (Staff Only)
                    </label>
                    <textarea
                      rows={2}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                    />
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleSaveNotes}
                      className="px-3 py-1.5 font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
                    >
                      Save Notes
                    </button>
                  </div>
                )}

                <div className="pt-3 border-t border-[#E4DDD0] space-y-2">
                  <p className="font-semibold text-slate-900">
                    Native Orders ({detail.orders.length}) &amp; Support Cases (
                    {detail.supportCases.length})
                  </p>
                  {detail.orders.length === 0 ? (
                    <p className="text-slate-500">No native store orders on record.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detail.orders.map((o) => (
                        <li
                          key={o.id}
                          className="flex items-center justify-between bg-[#FAF8F4] px-2.5 py-1.5 rounded border border-[#E4DDD0]"
                        >
                          <span className="font-mono">{o.orderReference}</span>
                          <span className="uppercase font-medium">{o.paymentStatus}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-3 border-t border-[#E4DDD0] space-y-2">
                  <p className="font-semibold text-slate-900">Account Activity Timeline</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {detail.activityTimeline.length === 0 ? (
                      <p className="text-slate-500">No activity recorded yet.</p>
                    ) : (
                      detail.activityTimeline.map((ev) => (
                        <div key={ev.id} className="border-b border-slate-100 pb-1">
                          <span className="font-mono font-semibold text-slate-800">
                            {ev.eventType}
                          </span>{' '}
                          <span className="text-slate-400">
                            · {new Date(ev.createdAt).toLocaleString()}
                          </span>
                          {ev.details && <p className="text-slate-600">{ev.details}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
