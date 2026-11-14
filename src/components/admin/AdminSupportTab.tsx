import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import type { AdminPermission } from '../../lib/rbac';
import type { Product, SupportCaseRecord } from '../../types/store';

interface AdminSupportTabProps {
  supportCases: SupportCaseRecord[];
  enquiries: any[];
  subscribers: any[];
  products: Product[];
  hasPermission: (p: AdminPermission) => boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onToast: (msg: string) => void;
  onRefresh: () => Promise<void>;
  onRequireReauth: (retry: () => Promise<void>) => void;
}

const CASE_CATEGORIES = [
  { value: 'paid_no_access', label: 'Paid Checkout / Missing Access' },
  { value: 'broken_download', label: 'Broken or Expired Download Link' },
  { value: 'missing_product', label: 'Product Missing from Account' },
  { value: 'account_login', label: 'Account Login / Registration' },
  { value: 'email_verification', label: 'Email Verification / Password Reset' },
  { value: 'account_association', label: 'Purchase / Account Association' },
  { value: 'failed_checkout', label: 'Failed Checkout' },
  { value: 'duplicate_tx', label: 'Duplicate Transaction' },
  { value: 'order_status', label: 'Order Status' },
  { value: 'app_error', label: 'Application Error' },
  { value: 'business_licensing', label: 'Business & Institutional Licensing' },
  { value: 'general_enquiry', label: 'General Enquiry' },
];

export function AdminSupportTab({
  supportCases,
  enquiries,
  subscribers,
  products,
  hasPermission,
  getAuthHeaders,
  onToast,
  onRefresh,
  onRequireReauth,
}: AdminSupportTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<number | null>(
    supportCases[0]?.id ?? null
  );
  const [showCreate, setShowCreate] = useState(false);

  const [newCase, setNewCase] = useState({
    customerName: '',
    customerEmail: '',
    category: 'paid_no_access',
    relatedProductSlug: '',
    transactionReference: '',
    priority: 'normal',
    subject: '',
    description: '',
  });

  const selectedCase = useMemo(
    () => supportCases.find((c) => c.id === selectedId) || supportCases[0] || null,
    [supportCases, selectedId]
  );

  const [statusDraft, setStatusDraft] = useState<string>('');
  const [priorityDraft, setPriorityDraft] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [resolutionDraft, setResolutionDraft] = useState<string>('');
  const [actionResultUrl, setActionResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManageCases = hasPermission('manage_support_cases');

  const selectCase = (c: SupportCaseRecord) => {
    setSelectedId(c.id);
    setStatusDraft(c.status);
    setPriorityDraft(c.priority);
    setNotesDraft(c.internalNotes || '');
    setResolutionDraft(c.resolutionSummary || '');
    setActionResultUrl(null);
  };

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return supportCases.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (q) {
        const hay = `${c.caseReference} ${c.customerEmail} ${c.customerName} ${c.subject} ${
          c.transactionReference || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [supportCases, search, statusFilter]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch('/api/admin/support-cases', {
        method: 'POST',
        headers,
        body: JSON.stringify(newCase),
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Unable to log support case.');
        return;
      }
      onToast(`Created support case ${json.supportCase.caseReference}.`);
      setShowCreate(false);
      setNewCase({
        customerName: '',
        customerEmail: '',
        category: 'paid_no_access',
        relatedProductSlug: '',
        transactionReference: '',
        priority: 'normal',
        subject: '',
        description: '',
      });
      await onRefresh();
      setSelectedId(json.supportCase.id);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCaseUpdate = async () => {
    if (!selectedCase) return;
    setBusy(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch(`/api/admin/support-cases/${selectedCase.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: statusDraft || selectedCase.status,
          priority: priorityDraft || selectedCase.priority,
          internalNotes: notesDraft,
          resolutionSummary: resolutionDraft,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Unable to update support case.');
        return;
      }
      onToast(`Saved updates to ${selectedCase.caseReference}.`);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const runSafeResolutionAction = async (
    action:
      | 'trigger_password_reset'
      | 'resend_download_notification'
      | 'reissue_download_link'
      | 'restore_purchase_access'
      | 'suspend_customer'
      | 'reactivate_customer'
  ) => {
    if (!selectedCase) return;
    const execute = async () => {
      setBusy(true);
      setActionResultUrl(null);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch(`/api/admin/support-cases/${selectedCase.id}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action,
            reason: resolutionDraft || `Executed ${action} on ${selectedCase.caseReference}`,
          }),
        });
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          onRequireReauth(execute);
          return;
        }
        if (!res.ok) {
          onToast(json.error || 'Action could not be completed.');
          return;
        }
        if (json.downloadUrl) setActionResultUrl(json.downloadUrl);
        onToast(json.message || 'Resolution action logged.');
        await onRefresh();
      } finally {
        setBusy(false);
      }
    };
    await execute();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases by reference, email, subject, or tx ref..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#D5CCB9] rounded-lg"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'open', 'in_progress', 'escalated', 'resolved'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border capitalize ${
                statusFilter === st
                  ? 'bg-[#0A264A] text-white border-[#0A264A]'
                  : 'bg-white text-slate-700 border-[#E4DDD0] hover:bg-slate-50'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
          {canManageCases && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0A264A] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Case</span>
            </button>
          )}
        </div>
      </div>

      {showCreate && canManageCases && (
        <form
          onSubmit={handleCreateCase}
          className="bg-white border border-[#D5CCB9] rounded-xl p-5 space-y-4"
        >
          <h3 className="font-display text-base font-bold text-slate-900">
            Create Internal Customer Support Case
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <input
              type="text"
              placeholder="Customer Name"
              value={newCase.customerName}
              onChange={(e) => setNewCase({ ...newCase, customerName: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
            <input
              type="email"
              required
              placeholder="Customer Email *"
              value={newCase.customerEmail}
              onChange={(e) => setNewCase({ ...newCase, customerEmail: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
            <select
              value={newCase.category}
              onChange={(e) => setNewCase({ ...newCase, category: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {CASE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Transaction Ref (Optional)"
              value={newCase.transactionReference}
              onChange={(e) =>
                setNewCase({ ...newCase, transactionReference: e.target.value })
              }
              className="px-3 py-2 font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <input
              type="text"
              required
              placeholder="Case Subject *"
              value={newCase.subject}
              onChange={(e) => setNewCase({ ...newCase, subject: e.target.value })}
              className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg"
            />
            <select
              value={newCase.relatedProductSlug}
              onChange={(e) =>
                setNewCase({ ...newCase, relatedProductSlug: e.target.value })
              }
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">No specific product</option>
              {products.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            required
            placeholder="Issue details *"
            value={newCase.description}
            onChange={(e) => setNewCase({ ...newCase, description: e.target.value })}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3.5 py-2 text-xs bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] rounded-lg"
            >
              Create Case
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-[#E4DDD0] rounded-xl divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
          {filteredCases.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No support cases match this filter.
            </p>
          ) : (
            filteredCases.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCase(c)}
                className={`w-full text-left p-4 space-y-1 transition-colors ${
                  selectedCase?.id === c.id ? 'bg-[#FAF8F4]' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono font-semibold text-[#0A264A]">
                    {c.caseReference}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded uppercase font-semibold ${
                      c.status === 'resolved'
                        ? 'bg-emerald-50 text-emerald-800'
                        : c.status === 'escalated'
                        ? 'bg-rose-50 text-rose-800'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {c.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 line-clamp-1">
                  {c.subject}
                </p>
                <p className="text-xs text-slate-500">
                  {c.customerEmail} · {c.category.replace(/_/g, ' ')}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-5">
          {!selectedCase ? (
            <p className="text-sm text-slate-500">
              Select a support case from the queue to inspect or resolve it.
            </p>
          ) : (
            <>
              <div className="border-b border-[#E4DDD0] pb-4 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#0A264A]">
                    {selectedCase.caseReference}
                  </span>
                  <span className="text-xs text-slate-500">
                    Opened {new Date(selectedCase.createdAt).toLocaleString()}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {selectedCase.subject}
                </h3>
                <p className="text-xs text-slate-600">
                  {selectedCase.customerName} ({selectedCase.customerEmail}) · Category:{' '}
                  <span className="font-medium text-slate-800">
                    {selectedCase.category.replace(/_/g, ' ')}
                  </span>
                  {selectedCase.transactionReference && (
                    <>
                      {' '}
                      · Tx Ref:{' '}
                      <span className="font-mono text-slate-900">
                        {selectedCase.transactionReference}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="bg-[#FAF8F4] border border-[#E4DDD0] rounded-lg p-3.5 text-sm text-slate-800 whitespace-pre-line">
                {selectedCase.description}
              </div>

              {canManageCases && (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-900">
                      Permitted Safe Resolution Actions
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runSafeResolutionAction('trigger_password_reset')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-md"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Send Password Reset</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runSafeResolutionAction('reissue_download_link')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#0A264A] font-semibold rounded-md"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Reissue Paid Download Link</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runSafeResolutionAction('resend_download_notification')
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-md"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email Download Notification</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runSafeResolutionAction('restore_purchase_access')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-emerald-800 font-semibold rounded-md"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Restore Verified Access</span>
                      </button>
                      {selectedCase.userId && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runSafeResolutionAction('suspend_customer')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold rounded-md"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Suspend Customer</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runSafeResolutionAction('reactivate_customer')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-md"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Reactivate Customer</span>
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        Security rule: Unpaid or failed transactions can never be manually overridden to paid without Paystack verification.
                      </span>
                    </p>
                  </div>

                  {actionResultUrl && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs space-y-1">
                      <p className="font-semibold text-emerald-900">
                        Generated 15-minute Signed Download Path:
                      </p>
                      <code className="block break-all bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-950">
                        {window.location.origin}
                        {actionResultUrl}
                      </code>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-[#E4DDD0]">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Case Status
                      </label>
                      <select
                        value={statusDraft || selectedCase.status}
                        onChange={(e) => setStatusDraft(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="escalated">Escalated</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Priority
                      </label>
                      <select
                        value={priorityDraft || selectedCase.priority}
                        onChange={(e) => setPriorityDraft(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="block font-medium text-slate-700">
                      Customer-Facing Resolution Explanation
                    </label>
                    <textarea
                      rows={2}
                      value={resolutionDraft}
                      onChange={(e) => setResolutionDraft(e.target.value)}
                      placeholder="Visible on customer's support case dashboard when resolved..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <label className="block font-medium text-slate-700 pt-1">
                      Internal Staff Notes (Never shown to customer)
                    </label>
                    <textarea
                      rows={2}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Internal investigation notes..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSaveCaseUpdate}
                      className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Case Update</span>
                    </button>
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-[#E4DDD0] space-y-2 text-xs">
                <p className="font-semibold text-slate-900">Resolution &amp; Action History</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(selectedCase.resolutionHistory || []).map((entry, idx) => (
                    <div key={idx} className="border-b border-slate-100 pb-1">
                      <span className="font-mono font-semibold text-slate-800">
                        {entry.action}
                      </span>{' '}
                      <span className="text-slate-400">
                        by {entry.actorEmail} · {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      <p className="text-slate-600">{entry.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legacy Enquiries & Newsletter Subscribers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E4DDD0] rounded-xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-slate-900">
            Inbound Contact Submissions ({enquiries.length})
          </h3>
          {enquiries.length === 0 ? (
            <p className="text-xs text-slate-500">No contact submissions recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto text-xs">
              {enquiries.map((e) => (
                <div key={e.id} className="border-b border-slate-100 pb-2">
                  <div className="flex justify-between font-medium text-slate-900">
                    <span>{e.subject}</span>
                    <span className="font-mono uppercase text-slate-500">{e.status}</span>
                  </div>
                  <p className="text-slate-500">
                    {e.name} ({e.email})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E4DDD0] rounded-xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-slate-900">
            Newsletter &amp; Free Resource Subscribers ({subscribers.length})
          </h3>
          {subscribers.length === 0 ? (
            <p className="text-xs text-slate-500">No subscribers recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto text-xs">
              {subscribers.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border-b border-slate-100 pb-1.5"
                >
                  <span className="text-slate-800">{s.email}</span>
                  <span className="font-mono text-slate-500">{s.source}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
