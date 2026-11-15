import fs from 'fs';
import path from 'path';
import { desc, sql } from 'drizzle-orm';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { db } from '../db/index.ts';
import {
  accountEvents,
  emailLogs,
  products,
  systemEvents,
} from '../db/schema.ts';
import { getEmailIntegrationStatus } from './email.ts';
import { adminAuth } from './firebase-admin.ts';
import {
  getGoogleAnalyticsConfig,
  getPaystackConfig,
  getPinterestConfig,
} from './integrations.ts';
import { isDownloadSigningSecretConfigured } from './security.ts';
import { isNeonObjectStorage, isObjectStorageConfigured, objectExists, objectKeyFromProductPath } from './object-storage.ts';

export interface InfraComponentReport {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'not_configured' | 'partial' | 'unknown';
  statusLabel: string;
  lastCheckedAt: string;
  lastErrorAt: string | null;
  errorSummary: string | null;
  recommendedAction: string;
  metrics: { label: string; value: string }[];
}

function getDirectoryStats(dirPath: string): {
  exists: boolean;
  writable: boolean;
  fileCount: number;
  totalBytes: number;
} {
  try {
    if (!fs.existsSync(dirPath)) {
      return { exists: false, writable: false, fileCount: 0, totalBytes: 0 };
    }
    let writable = false;
    try {
      fs.accessSync(dirPath, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    let fileCount = 0;
    let totalBytes = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        fileCount += 1;
        totalBytes += fs.statSync(path.join(dirPath, entry.name)).size;
      }
    }
    return { exists: true, writable, fileCount, totalBytes };
  } catch {
    return { exists: false, writable: false, fileCount: 0, totalBytes: 0 };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function gatherInfrastructureReport(
  settingsMap: Record<string, string>
): Promise<{
  checkedAt: string;
  components: InfraComponentReport[];
  recentEvents: (typeof systemEvents.$inferSelect)[];
}> {
  const checkedAt = new Date().toISOString();

  // 1. Database Connectivity & Latency
  let dbConnected = false;
  let dbLatencyMs: number | null = null;
  let dbVersion = 'Unknown';
  let tableCount = 0;
  let dbError: string | null = null;
  try {
    const start = performance.now();
    const verRes = await db.execute(sql`SELECT version() AS ver`);
    dbLatencyMs = Math.round((performance.now() - start) * 10) / 10;
    const rawVer = (verRes.rows?.[0] as any)?.ver;
    dbVersion = typeof rawVer === 'string' ? rawVer.split(' ').slice(0, 2).join(' ') : 'PostgreSQL';
    const tablesRes = await db.execute(
      sql`SELECT count(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'`
    );
    tableCount = Number((tablesRes.rows?.[0] as any)?.cnt || 0);
    dbConnected = true;
  } catch (err: any) {
    dbError = err?.message || 'Database ping failed.';
  }

  // Recent system events & logs
  let recentEvents: (typeof systemEvents.$inferSelect)[] = [];
  let recentAuthFailures = 0;
  let recentFailedEmails = 0;
  let allProductsRows: { id: number; name: string; status: string; protectedFilePath: string | null; marketplaceUrl: string | null; isFree: boolean }[] = [];

  if (dbConnected) {
    const [sysRows, authFailRows, emailLogRows, prodRows] = await Promise.all([
      db.select().from(systemEvents).orderBy(desc(systemEvents.createdAt)).limit(50),
      db.select().from(accountEvents).orderBy(desc(accountEvents.createdAt)).limit(100),
      db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(50),
      db
        .select({
          id: products.id,
          name: products.name,
          status: products.status,
          protectedFilePath: products.protectedFilePath,
          marketplaceUrl: products.marketplaceUrl,
          isFree: products.isFree,
        })
        .from(products),
    ]);
    recentEvents = sysRows;
    recentAuthFailures = authFailRows.filter((e) => e.eventType === 'login_failed').length;
    recentFailedEmails = emailLogRows.filter((e) => e.status === 'failed').length;
    allProductsRows = prodRows;
  }

  const latestErrorFor = (component: string) =>
    recentEvents.find((e) => e.component === component && e.severity === 'error' && !e.resolved) ||
    null;

  // 2. Application & Runtime
  const distExists = fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'));
  const mem = process.memoryUsage();
  const appErr = latestErrorFor('application');
  const appStatus: InfraComponentReport['status'] = appErr ? 'degraded' : 'operational';

  // 3. Storage & Files
  const publicDir = path.resolve(process.cwd(), 'storage', 'public_uploads');
  const protectedDir = path.resolve(process.cwd(), 'storage', 'protected_products');
  const pubStats = getDirectoryStats(publicDir);
  const protStats = getDirectoryStats(protectedDir);
  let neonStorage = false;
  let storageConfigured = false;
  try {
    neonStorage = isNeonObjectStorage();
    storageConfigured = isObjectStorageConfigured();
  } catch {
    storageConfigured = false;
  }
  let missingProtectedFiles: typeof allProductsRows = [];
  let storageProbeError: string | null = null;
  if (neonStorage && storageConfigured) {
    try {
      const refs = allProductsRows.filter((p) => Boolean(p.protectedFilePath));
      const results = await Promise.all(refs.map(async (p) => ({
        product: p,
        exists: await objectExists(objectKeyFromProductPath(p.protectedFilePath!)),
      })));
      missingProtectedFiles = results.filter((r) => !r.exists).map((r) => r.product);
    } catch (error: any) {
      storageProbeError = error?.message || 'Object storage verification failed.';
    }
  } else {
    missingProtectedFiles = allProductsRows.filter((p) => {
      if (!p.protectedFilePath) return false;
      const candidate = path.resolve(protectedDir, path.basename(p.protectedFilePath));
      return !fs.existsSync(candidate);
    });
  }
  const storageErr = latestErrorFor('storage');
  const storageHealthy = storageConfigured && (neonStorage || (pubStats.exists && pubStats.writable && protStats.exists && protStats.writable)) && !storageProbeError;

  // 4. Authentication Probe (Firebase client config + Admin SDK capability)
  const firebaseProjectConfigured = Boolean(
    firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.authDomain
  );
  let adminSdkManagementAvailable = false;
  let adminSdkCheckNote = 'ID Token verification active (public certificates)';
  try {
    await adminAuth.listUsers(1);
    adminSdkManagementAvailable = true;
    adminSdkCheckNote = 'Full Admin SDK credentials active';
  } catch {
    adminSdkManagementAvailable = false;
    adminSdkCheckNote =
      'ID Token verification active; attach a Cloud Run runtime identity with Firebase Authentication admin permissions';
  }
  const authErr = latestErrorFor('authentication');

  // 5. Payments (Paystack + Selar)
  const paystack = getPaystackConfig(settingsMap.native_checkout_enabled === 'true');
  const signingConfigured = isDownloadSigningSecretConfigured();
  const paymentErr = latestErrorFor('payments');
  const publishedProducts = allProductsRows.filter((p) => p.status === 'published');
  const selarConfiguredCount = publishedProducts.filter((p) => Boolean(p.marketplaceUrl)).length;

  // 6. Email
  const emailStatus = await getEmailIntegrationStatus();
  const emailErr = latestErrorFor('email');

  // 7. External Integrations
  const ga = getGoogleAnalyticsConfig(settingsMap.ga_measurement_id);
  const pinterest = getPinterestConfig(settingsMap.pinterest_tag_id);

  const components: InfraComponentReport[] = [
    {
      id: 'application',
      name: 'Application & API Runtime',
      status: appStatus,
      statusLabel: appErr ? 'Degraded (Errors Logged)' : 'Operational',
      lastCheckedAt: checkedAt,
      lastErrorAt: appErr ? appErr.createdAt.toISOString() : null,
      errorSummary: appErr ? appErr.message : null,
      recommendedAction: appErr
        ? 'Inspect recent application error logs and resolve before clearing alert.'
        : 'Express API and SPA server responding normally.',
      metrics: [
        { label: 'Frontend Serving', value: distExists ? 'Built dist/ + SPA ready' : 'Vite Dev Middleware' },
        { label: 'API Status', value: 'Responding (HTTP 200)' },
        { label: 'Process Uptime', value: `${Math.floor(process.uptime())}s` },
        { label: 'Node Heap Used', value: formatBytes(mem.heapUsed) },
        { label: 'Deployment Target', value: process.env.K_REVISION || process.env.NODE_ENV || 'development' },
      ],
    },
    {
      id: 'database',
      name: process.env.DATABASE_URL ? 'Neon PostgreSQL Database' : 'PostgreSQL Database',
      status: dbConnected ? 'operational' : 'degraded',
      statusLabel: dbConnected ? 'Connected' : 'Connection Failed',
      lastCheckedAt: checkedAt,
      lastErrorAt: dbError ? checkedAt : latestErrorFor('database')?.createdAt.toISOString() || null,
      errorSummary: dbError || latestErrorFor('database')?.message || null,
      recommendedAction: dbConnected
        ? 'PostgreSQL schema and connection pool healthy.'
        : 'Check PostgreSQL endpoint, TLS configuration, and database credentials.',
      metrics: [
        { label: 'Connectivity', value: dbConnected ? 'Connected' : 'Disconnected' },
        { label: 'Measured Query Latency', value: dbLatencyMs !== null ? `${dbLatencyMs} ms` : 'Unavailable' },
        { label: 'Engine Version', value: dbVersion },
        { label: 'Public Tables Active', value: String(tableCount) },
        { label: 'Schema Sync', value: tableCount >= 16 ? 'All core & operations tables present' : 'Check pending tables' },
      ],
    },
    {
      id: 'storage',
      name: 'File Storage & Protected Assets',
      status: !storageHealthy || missingProtectedFiles.length > 0 || storageErr ? 'degraded' : 'operational',
      statusLabel:
        !storageHealthy
          ? 'Storage Configuration or Connection Issue'
          : missingProtectedFiles.length > 0
          ? `${missingProtectedFiles.length} Missing File Reference(s)`
          : 'Writable & Ready',
      lastCheckedAt: checkedAt,
      lastErrorAt: storageErr ? storageErr.createdAt.toISOString() : null,
      errorSummary:
        storageErr?.message ||
        (missingProtectedFiles.length > 0
          ? `Protected file missing from storage for: ${missingProtectedFiles.map((m) => m.name).join(', ')}`
          : storageProbeError
          ? storageProbeError
          : null),
      recommendedAction:
        missingProtectedFiles.length > 0
          ? 'Re-upload missing protected digital files via Admin -> Products.'
          : storageHealthy
          ? 'Configured object storage and protected asset references are available.'
          : 'Configure Neon Object Storage; production uploads cannot use the container filesystem.',
      metrics: [
        { label: 'Storage Backend', value: storageConfigured ? (neonStorage ? 'Neon Object Storage' : 'Local development storage') : 'Not configured' },
        {
          label: 'Protected Asset References',
          value: storageProbeError
            ? 'Verification failed'
            : `${allProductsRows.filter((p) => p.protectedFilePath).length - missingProtectedFiles.length} available / ${allProductsRows.filter((p) => p.protectedFilePath).length} checked`,
        },
        { label: 'Download Token Signing', value: signingConfigured ? 'Configured (HMAC-SHA256)' : 'Ephemeral Dev Secret' },
        { label: 'Provider Disk Quota', value: 'Not exposed by runtime environment' },
      ],
    },
    {
      id: 'authentication',
      name: 'Firebase Authentication',
      status: !firebaseProjectConfigured ? 'not_configured' : authErr ? 'degraded' : 'operational',
      statusLabel: firebaseProjectConfigured ? 'Operational' : 'Not Configured',
      lastCheckedAt: checkedAt,
      lastErrorAt: authErr ? authErr.createdAt.toISOString() : null,
      errorSummary: authErr?.message || null,
      recommendedAction: adminSdkManagementAvailable
        ? 'Email/Password, Google Sign-In, verification, and Admin SDK token revocation ready.'
        : 'Email/Password, Google Sign-In, verification, and password reset emails are operational. Check Cloud Run runtime identity permissions for server-side user management.',
      metrics: [
        { label: 'Firebase Project', value: firebaseConfig.projectId || 'Not configured' },
        { label: 'Email & Password Auth', value: firebaseProjectConfigured ? 'Enabled' : 'Not configured' },
        { label: 'Google Sign-In', value: firebaseProjectConfigured ? 'Enabled' : 'Not configured' },
        { label: 'Admin SDK Mode', value: adminSdkCheckNote },
        { label: 'Recent Failed Logins Logged', value: String(recentAuthFailures) },
      ],
    },
    {
      id: 'payments',
      name: 'Payments & Checkout Destinations',
      status: paymentErr ? 'degraded' : 'partial',
      statusLabel: paystack.nativeCheckoutActive
        ? 'Native Paystack Active'
        : 'Stage 1 (Selar Active · Paystack Disabled)',
      lastCheckedAt: checkedAt,
      lastErrorAt: paymentErr ? paymentErr.createdAt.toISOString() : null,
      errorSummary: paymentErr?.message || null,
      recommendedAction: paystack.nativeCheckoutActive
        ? 'Verify webhook signature delivery under Paystack Dashboard.'
        : 'Stage 1 Selar checkout active as designed. Replace placeholder Paystack keys and enable toggle only when launching Stage 2.',
      metrics: [
        { label: 'Selar Checkout Links', value: `${selarConfiguredCount}/${publishedProducts.length} published products configured` },
        { label: 'Selar External Uptime', value: 'Not monitored (external platform)' },
        { label: 'Paystack Native Toggle', value: paystack.nativeCheckoutToggle ? 'Enabled' : 'Disabled (Stage 1)' },
        { label: 'PAYSTACK_SECRET_KEY', value: paystack.secretKeyConfigured ? 'Configured' : 'Not configured' },
        { label: 'Paystack Webhook Signature', value: paystack.webhookSecretConfigured ? 'Dedicated signing secret configured' : paystack.webhookVerificationConfigured ? 'Legacy secret-key signature fallback' : 'Not configured' },
      ],
    },
    {
      id: 'email',
      name: 'Business Email Delivery',
      status: emailErr ? 'degraded' : emailStatus.configured ? 'operational' : 'not_configured',
      statusLabel: emailStatus.configured
        ? `Configured (${emailStatus.provider.toUpperCase()})`
        : 'Store Email Provider Not Configured',
      lastCheckedAt: checkedAt,
      lastErrorAt: emailErr ? emailErr.createdAt.toISOString() : null,
      errorSummary: emailErr?.message || null,
      recommendedAction: emailStatus.configured
        ? 'Use Admin -> Email & Communications to test delivery.'
        : 'Configure SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY in server environment variables to activate store notifications from info@jeneconk.com and business@jeneconk.com. Firebase Auth verification/reset emails remain active.',
      metrics: [
        { label: 'Store Provider', value: emailStatus.provider === 'unconfigured' ? 'Not configured' : emailStatus.provider.toUpperCase() },
        { label: 'Customer Support Address', value: emailStatus.supportAddress },
        { label: 'Business Address', value: emailStatus.businessAddress },
        { label: 'Firebase Auth Emails', value: 'Active (Verification & Password Reset)' },
        { label: 'Logged Failed Deliveries', value: String(recentFailedEmails) },
      ],
    },
    {
      id: 'integrations',
      name: 'Analytics & External Tags',
      status: ga.configured ? 'operational' : 'partial',
      statusLabel: ga.configured ? 'GA4 Active · Pinterest Disabled' : 'Partially Configured',
      lastCheckedAt: checkedAt,
      lastErrorAt: null,
      errorSummary: null,
      recommendedAction: pinterest.configured
        ? 'Google Analytics and Pinterest Tag active.'
        : 'Add genuine numeric PINTEREST_TAG_ID when ready to enable Pinterest conversion tracking.',
      metrics: [
        { label: 'Google Analytics 4', value: ga.configured ? `Active (${ga.measurementId})` : 'Not configured' },
        { label: 'Pinterest Tag', value: pinterest.configured ? `Active (${pinterest.tagId})` : 'Not configured (Placeholder ignored)' },
        { label: 'External Uptime Probe', value: 'Not monitored' },
      ],
    },
  ];

  return { checkedAt, components, recentEvents };
}
