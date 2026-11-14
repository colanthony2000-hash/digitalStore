import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Mail,
  RefreshCw,
  Send,
  Wrench,
} from 'lucide-react';
import type { AdminPermission } from '../../lib/rbac';
import type {
  EmailLogRecord,
  InfraComponentReport,
  Product,
  SystemEventRecord,
} from '../../types/store';

interface InfraTabProps {
  infrastructure: {
    checkedAt: string;
    components: InfraComponentReport[];
    recentEvents: SystemEventRecord[];
  };
  hasPermission: (p: AdminPermission) => boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onToast: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

const STATUS_BADGE: Record<InfraComponentReport['status'], string> = {
  operational: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  partial: 'bg-amber-50 text-amber-800 border-amber-200',
  not_configured: 'bg-slate-100 text-slate-700 border-slate-300',
  degraded: 'bg-rose-50 text-rose-800 border-rose-200',
  unknown: 'bg-slate-100 text-slate-600 border-slate-300',
};

export function AdminInfraTab({
  infrastructure,
  hasPermission,
  getAuthHeaders,
  onToast,
  onRefresh,
}: InfraTabProps) {
  const [busy, setBusy] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState<any>(null);

  const canRunSafeOps = hasPermission('run_safe_ops');

  const handleHealthCheck = async () => {
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/infrastructure/health-check', {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        onToast('Health check failed.');
        return;
      }
      onToast('Infrastructure health check completed.');
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleMaintenanceCheck = async () => {
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/infrastructure/maintenance-check', {
        method: 'POST',
        headers,
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Diagnostics failed.');
        return;
      }
      setMaintenanceResult(json.diagnostics);
      onToast('Safe maintenance integrity check completed.');
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRetryNotifications = async () => {
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/infrastructure/retry-notifications', {
        method: 'POST',
        headers,
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Unable to retry notifications.');
        return;
      }
      onToast(`Retried ${json.retried} failed notification(s); ${json.succeeded} sent.`);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleResolveEvent = async (id: number) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/infrastructure/events/${id}/resolve`, {
      method: 'PATCH',
      headers,
    });
    if (res.ok) {
      onToast('Incident marked resolved.');
      await onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E4DDD0] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Infrastructure Monitoring &amp; Safe Operations
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Live database pings, filesystem checks, authentication probes, and integration checks. Last verified:{' '}
            <span className="font-mono">
              {new Date(infrastructure.checkedAt).toLocaleString()}
            </span>
          </p>
        </div>

        {canRunSafeOps && (
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={handleHealthCheck}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg disabled:opacity-60"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Run Health Check</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleMaintenanceCheck}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Safe Integrity Check</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleRetryNotifications}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Retry Failed Emails</span>
            </button>
          </div>
        )}
      </div>

      {maintenanceResult && (
        <div className="bg-[#FAF8F4] border border-[#D5CCB9] rounded-xl p-4 text-xs space-y-2">
          <div className="flex items-center justify-between font-semibold text-slate-900">
            <span>Safe Integrity Check Output</span>
            <span className="font-mono text-slate-500">
              {new Date(maintenanceResult.checkedAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-slate-500 block">Products Audited</span>
              <span className="font-mono font-bold text-slate-900">
                {maintenanceResult.totalProducts}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Missing Protected Files</span>
              <span className="font-mono font-bold text-slate-900">
                {maintenanceResult.missingProtectedFilesOnDisk.length}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Stale Pending Orders (&gt;24h)</span>
              <span className="font-mono font-bold text-slate-900">
                {maintenanceResult.stalePendingOrdersOlderThan24h}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Unresolved Incidents</span>
              <span className="font-mono font-bold text-slate-900">
                {maintenanceResult.unresolvedSystemAlerts}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {infrastructure.components.map((comp) => (
          <div
            key={comp.id}
            className="bg-white border border-[#E4DDD0] rounded-xl p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#0A264A]" />
                <h3 className="font-display text-sm font-bold text-slate-900">
                  {comp.name}
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap ${
                  STATUS_BADGE[comp.status]
                }`}
              >
                {comp.statusLabel}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              {comp.metrics.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1"
                >
                  <span className="text-slate-500">{m.label}</span>
                  <span className="font-mono text-slate-800 text-right">{m.value}</span>
                </div>
              ))}
            </div>

            {comp.errorSummary && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-2.5 rounded-lg">
                <strong>Last Error:</strong> {comp.errorSummary}
              </div>
            )}

            <p className="text-[11px] text-slate-600 leading-relaxed">
              <strong className="text-slate-800">Action:</strong> {comp.recommendedAction}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-slate-900">
          System Events &amp; Incident Logs ({infrastructure.recentEvents.length})
        </h3>
        {infrastructure.recentEvents.length === 0 ? (
          <p className="text-xs text-slate-500">No system incidents logged.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
            {infrastructure.recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono uppercase text-[10px] font-semibold ${
                        ev.severity === 'error'
                          ? 'bg-rose-100 text-rose-800'
                          : ev.severity === 'warning'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {ev.severity}
                    </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {ev.component} · {ev.eventType}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-slate-700">{ev.message}</p>
                  {ev.details && <p className="text-slate-500 font-mono">{ev.details}</p>}
                </div>
                <div className="shrink-0">
                  {ev.resolved ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resolved
                    </span>
                  ) : (
                    canRunSafeOps && (
                      <button
                        type="button"
                        onClick={() => handleResolveEvent(ev.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded"
                      >
                        Mark Resolved
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface EmailTabProps {
  emailStatus: {
    configured: boolean;
    provider: 'smtp' | 'resend' | 'unconfigured';
    supportAddress: string;
    businessAddress: string;
    fromAddress: string;
    firebaseAuthEmailActive: boolean;
    detailMessage: string;
  };
  emailLogs: EmailLogRecord[];
  canManageSettings: boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onToast: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

export function AdminEmailTab({
  emailStatus,
  emailLogs,
  canManageSettings,
  getAuthHeaders,
  onToast,
  onRefresh,
}: EmailTabProps) {
  const [testTo, setTestTo] = useState('');
  const [fromIdentity, setFromIdentity] = useState<'support' | 'business'>('support');
  const [sending, setSending] = useState(false);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: testTo.trim(), fromIdentity }),
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Test email failed.');
        return;
      }
      onToast(`Test email delivered to ${json.to} via ${json.provider}.`);
      await onRefresh();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#0A264A]" />
              <h2 className="font-display text-lg font-bold text-slate-900">
                Business Email Configuration
              </h2>
            </div>
            <span
              className={`px-2.5 py-0.5 text-xs font-medium rounded border ${
                emailStatus.configured
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              {emailStatus.configured
                ? `Active (${emailStatus.provider.toUpperCase()})`
                : 'Not Configured'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-[#FAF8F4] border border-[#E4DDD0] rounded-lg p-3">
              <span className="text-slate-500 block">Customer Support Identity</span>
              <span className="font-mono font-semibold text-slate-900">
                {emailStatus.supportAddress}
              </span>
            </div>
            <div className="bg-[#FAF8F4] border border-[#E4DDD0] rounded-lg p-3">
              <span className="text-slate-500 block">Business &amp; Licensing Identity</span>
              <span className="font-mono font-semibold text-slate-900">
                {emailStatus.businessAddress}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {emailStatus.detailMessage}
          </p>

          {!emailStatus.configured && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Store Transactional Email Requires Server Env Vars</p>
                <p className="mt-0.5 leading-relaxed">
                  Configure <code className="font-mono">SMTP_HOST</code>,{' '}
                  <code className="font-mono">SMTP_USER</code>, and{' '}
                  <code className="font-mono">SMTP_PASS</code> (or{' '}
                  <code className="font-mono">RESEND_API_KEY</code>) in deployment secrets to enable outbound store alerts from{' '}
                  <code className="font-mono">info@jeneconk.com</code> and{' '}
                  <code className="font-mono">business@jeneconk.com</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSendTest}
          className="lg:col-span-6 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4"
        >
          <h2 className="font-display text-lg font-bold text-slate-900">
            Send Test Store Email
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Sender Identity</label>
              <select
                value={fromIdentity}
                onChange={(e) => setFromIdentity(e.target.value as 'support' | 'business')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="support">
                  Customer Support ({emailStatus.supportAddress})
                </option>
                <option value="business">
                  Business &amp; Licensing ({emailStatus.businessAddress})
                </option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                required
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="recipient@jeneconk.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!emailStatus.configured || !canManageSettings || sending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {!emailStatus.configured
                ? 'Provider Not Configured (Send Disabled)'
                : sending
                ? 'Sending...'
                : 'Send Test Email'}
            </span>
          </button>
        </form>
      </div>

      <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-3">
        <h3 className="font-display text-base font-bold text-slate-900">
          Email Delivery Logs ({emailLogs.length})
        </h3>
        {emailLogs.length === 0 ? (
          <p className="text-xs text-slate-500">No store email attempts logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-[#E4DDD0]">
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emailLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-3 font-medium">{log.recipientEmail}</td>
                    <td className="py-2 pr-3 font-mono text-slate-600">{log.fromAddress}</td>
                    <td className="py-2 pr-3">{log.subject}</td>
                    <td className="py-2 pr-3 font-mono text-slate-500">{log.category}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded font-mono uppercase text-[10px] ${
                          log.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-800'
                            : log.status === 'failed'
                            ? 'bg-rose-50 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface ReportsTabProps {
  products: Product[];
  analytics: any;
  canExport: boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onToast: (msg: string) => void;
}

export function AdminReportsTab({
  products,
  analytics,
  canExport,
  getAuthHeaders,
  onToast,
}: ReportsTabProps) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [productSlug, setProductSlug] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const exportCsv = async (
    type: 'orders' | 'customers' | 'downloads' | 'support_cases' | 'system_events'
  ) => {
    if (!canExport) return;
    setDownloading(type);
    try {
      const params = new URLSearchParams({ type });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (productSlug) params.set('productSlug', productSlug);

      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/reports/export?${params.toString()}`, {
        headers,
      });
      if (!res.ok) {
        onToast('Unable to export CSV report.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jeneconk-${type}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onToast(`Exported ${type} CSV report.`);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Customers</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {analytics.totalCustomers ?? 0}
          </p>
        </div>
        <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
          <p className="text-xs text-slate-500">New Registrations (7d)</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#0A264A] tabular-nums">
            {analytics.newRegistrations7d ?? 0}
          </p>
        </div>
        <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
          <p className="text-xs text-slate-500">Free &amp; Protected Downloads</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {(analytics.freeDownloads ?? 0) + (analytics.protectedDownloadsCount ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
          <p className="text-xs text-slate-500">Open Support Cases</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {analytics.openSupportCasesCount ?? 0}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Operational &amp; Compliance CSV Exports
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Filter records by date range and product before generating CSV exports. All exports exclude credentials and secret tokens.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Product Filter (Support Cases)
            </label>
            <select
              value={productSlug}
              onChange={(e) => setProductSlug(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!canExport ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Your assigned role has read-only reporting visibility without CSV export permission.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {(
              [
                ['orders', 'Orders & Transactions CSV'],
                ['customers', 'Customer Directory CSV'],
                ['support_cases', 'Support Cases CSV'],
                ['downloads', 'Download Activity CSV'],
                ['system_events', 'Infrastructure Incidents CSV'],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                disabled={downloading !== null}
                onClick={() => exportCsv(type)}
                className="flex items-center justify-between px-4 py-3 bg-[#FAF8F4] border border-[#D5CCB9] hover:border-[#0A264A] rounded-lg font-semibold text-slate-900"
              >
                <span>{downloading === type ? 'Preparing CSV...' : label}</span>
                <Download className="w-4 h-4 text-[#0A264A]" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
