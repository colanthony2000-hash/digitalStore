import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { isPlaceholderValue } from './integrations.ts';

let ephemeralDevSecret: string | null = null;
let warnedMissingDevSecret = false;

export function isDownloadSigningSecretConfigured(): boolean {
  const raw = (process.env.DOWNLOAD_SIGNING_SECRET || '').trim();
  return !isPlaceholderValue(raw) && raw.length >= 16;
}

export function validateProductionSigningSecret(): void {
  if (process.env.NODE_ENV === 'production' && !isDownloadSigningSecretConfigured()) {
    throw new Error(
      'DOWNLOAD_SIGNING_SECRET must be set to a strong non-placeholder value (at least 16 characters) in production.'
    );
  }
}

function getSigningSecret(): string {
  const raw = (process.env.DOWNLOAD_SIGNING_SECRET || '').trim();
  if (isDownloadSigningSecretConfigured()) {
    return raw;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DOWNLOAD_SIGNING_SECRET is unset or uses a placeholder value in production.'
    );
  }

  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
    if (!warnedMissingDevSecret) {
      warnedMissingDevSecret = true;
      console.warn(
        '[security] DOWNLOAD_SIGNING_SECRET is not configured; using an ephemeral per-process secret for local development only.'
      );
    }
  }
  return ephemeralDevSecret;
}

export interface DownloadTokenPayload {
  productId: number;
  orderItemId: number | null;
  userId: number | null;
  email: string | null;
  exp: number;
}

export function signDownloadToken(
  payload: Omit<DownloadTokenPayload, 'exp'>,
  ttlSeconds = 900
): string {
  const secret = getSigningSecret();
  const fullPayload: DownloadTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  let secret: string;
  try {
    secret = getSigningSecret();
  } catch {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as DownloadTokenPayload;
    if (
      !Number.isSafeInteger(payload.productId) || payload.productId <= 0 ||
      !(payload.orderItemId === null || (Number.isSafeInteger(payload.orderItemId) && payload.orderItemId > 0)) ||
      !(payload.userId === null || (Number.isSafeInteger(payload.userId) && payload.userId > 0)) ||
      !(payload.email === null || typeof payload.email === 'string') ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

const MAX_RATE_BUCKETS = 10_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
}

const cleanupInterval = setInterval(() => {
  pruneExpiredBuckets(Date.now());
}, 60_000);
cleanupInterval.unref?.();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl}:${req.path}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && rateBuckets.size >= MAX_RATE_BUCKETS) {
        pruneExpiredBuckets(now);
        if (rateBuckets.size >= MAX_RATE_BUCKETS) {
          const oldestKey = rateBuckets.keys().next().value;
          if (oldestKey !== undefined) {
            rateBuckets.delete(oldestKey);
          }
        }
      }
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }

    bucket.count += 1;
    next();
  };
}

export async function recordAuditLog(params: {
  adminUid: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  details?: string;
  reason?: string;
  result?: 'success' | 'denied' | 'failed';
}) {
  try {
    await db.insert(auditLogs).values({
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId != null ? String(params.targetId) : null,
      details: params.details || null,
      reason: params.reason ? params.reason.slice(0, 500) : null,
      result: params.result || 'success',
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
