import crypto from 'node:crypto';

const PLACEHOLDER_FRAGMENTS = [
  'placeholder',
  'replace-with',
  'replace_with',
  'your_',
  'your-',
  'my_',
  'changeme',
  'dummy',
  'example',
  'sample',
  'todo',
  'tbd',
  'unset',
  'xxxx',
  '000000',
  'temp_',
  'temp-',
  'temporary',
  'development',
  'fake',
  'mock',
  'not_set',
  'not-set',
  'pending',
];

const EXACT_PLACEHOLDERS = new Set([
  'none',
  'null',
  'undefined',
  'test',
  'dev',
  'demo',
  'false',
  '12345',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
]);

export function isPlaceholderValue(raw?: string | null): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (EXACT_PLACEHOLDERS.has(lower)) return true;
  if (PLACEHOLDER_FRAGMENTS.some((frag) => lower.includes(frag))) return true;
  return false;
}

export interface PaystackConfigState {
  secretKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookVerificationConfigured: boolean;
  nativeCheckoutToggle: boolean;
  nativeCheckoutActive: boolean;
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  testKeyBlockedInProduction: boolean;
}

export function getPaystackConfig(nativeToggleEnabled: boolean): PaystackConfigState {
  const secretKey = (process.env.PAYSTACK_SECRET_KEY || '').trim();
  const publicKey = (process.env.PAYSTACK_PUBLIC_KEY || '').trim();
  const webhookSecret = (process.env.PAYSTACK_WEBHOOK_SECRET || '').trim();

  const secretKeyConfigured =
    !isPlaceholderValue(secretKey) &&
    /^sk_(live|test)_[a-z0-9]{16,}$/i.test(secretKey);

  const publicKeyConfigured =
    !isPlaceholderValue(publicKey) &&
    /^pk_(live|test)_[a-z0-9]{16,}$/i.test(publicKey);

  const webhookSecretConfigured =
    !isPlaceholderValue(webhookSecret) && webhookSecret.length >= 16;
  const testKeyBlockedInProduction =
    process.env.NODE_ENV === 'production' &&
    secretKey.startsWith('sk_test_') &&
    process.env.PAYSTACK_ALLOW_TEST_MODE !== 'true';

  // Stage 2 native checkout remains disabled unless explicitly toggled AND genuine keys exist
  const nativeCheckoutActive =
    nativeToggleEnabled && secretKeyConfigured && !testKeyBlockedInProduction;

  return {
    secretKeyConfigured,
    publicKeyConfigured,
    webhookSecretConfigured,
    webhookVerificationConfigured: webhookSecretConfigured || secretKeyConfigured,
    nativeCheckoutToggle: nativeToggleEnabled,
    nativeCheckoutActive,
    secretKey,
    publicKey,
    webhookSecret,
    testKeyBlockedInProduction,
  };
}

function safeHexSignatureMatch(expectedHex: string, actualHex: string): boolean {
  if (!/^[a-f0-9]{128}$/i.test(expectedHex) || !/^[a-f0-9]{128}$/i.test(actualHex)) {
    return false;
  }
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function verifyPaystackWebhookSignature(
  headers: {
    paystackSignature?: string | string[];
    legacySignature?: string | string[];
  },
  rawBody: Buffer,
  config: PaystackConfigState,
  nowMs = Date.now()
): boolean {
  const modernHeader = Array.isArray(headers.paystackSignature)
    ? headers.paystackSignature[0]
    : headers.paystackSignature;
  if (modernHeader) {
    if (!config.webhookSecretConfigured) return false;

    let timestampText = '';
    const v1Signatures: string[] = [];
    for (const component of modernHeader.split(',')) {
      const [name, ...valueParts] = component.trim().split('=');
      const value = valueParts.join('=').trim();
      if (name === 't') timestampText = value;
      if (name === 'v1') {
        const separator = value.indexOf(':');
        v1Signatures.push(separator >= 0 ? value.slice(separator + 1) : value);
      }
    }

    const timestamp = Number(timestampText);
    if (
      !Number.isInteger(timestamp) ||
      Math.abs(Math.floor(nowMs / 1000) - timestamp) > 300 ||
      v1Signatures.length === 0
    ) {
      return false;
    }

    const expectedHex = crypto.createHmac('sha512', config.webhookSecret)
      .update(`${timestampText}.`)
      .update(rawBody)
      .digest('hex');
    return v1Signatures.some((signature) => safeHexSignatureMatch(expectedHex, signature));
  }

  const legacyHeader = Array.isArray(headers.legacySignature)
    ? headers.legacySignature[0]
    : headers.legacySignature;
  if (!legacyHeader || !config.secretKeyConfigured) return false;
  const expectedHex = crypto.createHmac('sha512', config.secretKey)
    .update(rawBody)
    .digest('hex');
  return safeHexSignatureMatch(expectedHex, legacyHeader);
}

export interface PinterestConfigState {
  configured: boolean;
  tagId: string;
  source: 'settings' | 'env' | 'none';
}

export function isValidPinterestTagId(raw?: string | null): boolean {
  if (isPlaceholderValue(raw)) return false;
  return /^\d{8,20}$/.test(raw!.trim());
}

export function getPinterestConfig(settingsTagId?: string | null): PinterestConfigState {
  const fromSettings = (settingsTagId || '').trim();
  if (isValidPinterestTagId(fromSettings)) {
    return { configured: true, tagId: fromSettings, source: 'settings' };
  }

  const fromEnv = (process.env.PINTEREST_TAG_ID || '').trim();
  if (isValidPinterestTagId(fromEnv)) {
    return { configured: true, tagId: fromEnv, source: 'env' };
  }

  return { configured: false, tagId: '', source: 'none' };
}

export interface GoogleAnalyticsConfigState {
  configured: boolean;
  measurementId: string;
}

export function getGoogleAnalyticsConfig(
  settingsGaId?: string | null
): GoogleAnalyticsConfigState {
  const candidate =
    (settingsGaId || '').trim() || (process.env.GA_MEASUREMENT_ID || '').trim();
  if (!isPlaceholderValue(candidate) && /^(G|GT|AW)-[A-Z0-9]{6,16}$/i.test(candidate)) {
    return { configured: true, measurementId: candidate };
  }
  return { configured: false, measurementId: '' };
}
