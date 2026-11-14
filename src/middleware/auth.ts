import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { eq, sql } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import {
  hasPermission,
  isAdminConsoleRole,
  type AdminPermission,
} from '../lib/rbac.ts';
import { recordAccountEvent, recordSystemEvent } from '../lib/telemetry.ts';

export type DbUser = typeof users.$inferSelect;

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUser;
}

const DEFAULT_ADMIN_EMAILS = ['jeneconklms@gmail.com'];

function isBootstrappedAdminEmail(email?: string): boolean {
  if (!email) return false;
  const envAdmins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const allAdmins = new Set([...DEFAULT_ADMIN_EMAILS, ...envAdmins]);
  return allAdmins.has(email.toLowerCase());
}

function mergeProvider(existing: string, incoming: string): string {
  if (!incoming || incoming === 'unknown') return existing || 'unknown';
  if (!existing || existing === 'unknown') return incoming;
  if (existing === incoming || existing === 'multiple') return existing;
  return 'multiple';
}

export async function syncFirebaseUser(decoded: DecodedIdToken): Promise<DbUser> {
  const email = (decoded.email || `${decoded.uid}@users.jeneconk.com`).toLowerCase();
  const fullName = decoded.name || null;
  const emailVerified = Boolean(decoded.email_verified);
  const signInProvider =
    (decoded.firebase?.sign_in_provider as string | undefined) || 'unknown';
  const shouldBootstrapSuperAdmin =
    emailVerified && isBootstrappedAdminEmail(email);

  // 1. Lookup by primary UID or previously verified linked UIDs
  const byUid = await db
    .select()
    .from(users)
    .where(eq(users.uid, decoded.uid))
    .limit(1);

  let matched = byUid[0];

  if (!matched) {
    const byLinked = await db
      .select()
      .from(users)
      .where(sql`${users.linkedUids} @> ${JSON.stringify([decoded.uid])}::jsonb`)
      .limit(1);
    matched = byLinked[0];
  }

  // 2. Safe verified-email linking ONLY when Firebase proves email_verified === true
  if (!matched && emailVerified && decoded.email) {
    const byVerifiedEmail = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email} AND ${users.emailVerified} = true`)
      .limit(1);

    if (byVerifiedEmail.length > 0) {
      const target = byVerifiedEmail[0];
      const nextLinked = Array.from(
        new Set([...(target.linkedUids || []), target.uid, decoded.uid])
      );
      const nextProvider = mergeProvider(target.authProvider, signInProvider);
      const nextRole =
        shouldBootstrapSuperAdmin && target.role !== 'super_admin'
          ? 'super_admin'
          : target.role;

      const [linkedUser] = await db
        .update(users)
        .set({
          linkedUids: nextLinked,
          authProvider: nextProvider,
          role: nextRole,
          fullName: target.fullName || fullName,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id))
        .returning();

      await recordAccountEvent({
        userId: linkedUser.id,
        email: linkedUser.email,
        eventType: 'account_linked',
        details: `Verified identity linked via ${signInProvider}.`,
      });

      return linkedUser;
    }
  }

  if (matched) {
    const nextRole = shouldBootstrapSuperAdmin
      ? 'super_admin'
      : matched.role;
    const nextProvider = mergeProvider(matched.authProvider, signInProvider);
    const shouldBumpLogin =
      !matched.lastLoginAt || Date.now() - matched.lastLoginAt.getTime() > 5 * 60_000;

    const justVerified = !matched.emailVerified && emailVerified;

    const [updated] = await db
      .update(users)
      .set({
        email,
        fullName: matched.fullName || fullName,
        role: nextRole,
        emailVerified: matched.emailVerified || emailVerified,
        authProvider: nextProvider,
        lastLoginAt: shouldBumpLogin ? new Date() : matched.lastLoginAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, matched.id))
      .returning();

    if (justVerified) {
      await recordAccountEvent({
        userId: updated.id,
        email: updated.email,
        eventType: 'email_verified',
        details: `Verified email via ${signInProvider}.`,
      });
    }

    return updated;
  }

  // 3. New account creation (never grants admin unless explicitly bootstrapped + verified)
  const [inserted] = await db
    .insert(users)
    .values({
      uid: decoded.uid,
      email,
      fullName,
      role: shouldBootstrapSuperAdmin ? 'super_admin' : 'customer',
      accountStatus: 'active',
      emailVerified,
      authProvider: signInProvider,
      linkedUids: [decoded.uid],
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        emailVerified,
        updatedAt: new Date(),
      },
    })
    .returning();

  await recordAccountEvent({
    userId: inserted.id,
    email: inserted.email,
    eventType: 'registered',
    details: `Account initialized via ${signInProvider}.`,
  });

  return inserted;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const dbUser = await syncFirebaseUser(decodedToken);

    if (dbUser.sessionInvalidatedBefore && decodedToken.auth_time) {
      const authTimeMs = decodedToken.auth_time * 1000;
      if (authTimeMs < dbUser.sessionInvalidatedBefore.getTime()) {
        return res.status(401).json({
          code: 'SESSION_INVALIDATED',
          error:
            'Your session was invalidated following a security update or password reset. Please sign in again.',
        });
      }
    }

    req.user = decodedToken;
    req.dbUser = dbUser;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error);
    await recordSystemEvent({
      component: 'authentication',
      severity: 'warning',
      eventType: 'token_verification_failed',
      message: 'Failed Firebase ID token verification.',
      details: error?.code || error?.message || 'Invalid token',
    });
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session.' });
  }
};

export const requireActiveAccount = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
  }
  if (req.dbUser.accountStatus === 'suspended') {
    return res.status(403).json({
      code: 'ACCOUNT_SUSPENDED',
      error:
        req.dbUser.suspendedReason ||
        'This account is currently suspended. Contact info@jeneconk.com for assistance.',
    });
  }
  next();
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const dbUser = await syncFirebaseUser(decodedToken);
    if (
      !dbUser.sessionInvalidatedBefore ||
      !decodedToken.auth_time ||
      decodedToken.auth_time * 1000 >= dbUser.sessionInvalidatedBefore.getTime()
    ) {
      req.user = decodedToken;
      req.dbUser = dbUser;
    }
  } catch {
    // Ignore invalid optional token and continue anonymously
  }
  next();
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await requireAuth(req, res, () => {
    if (!req.dbUser || !isAdminConsoleRole(req.dbUser.role)) {
      return res.status(403).json({
        error: 'Forbidden: Operations console access is required for this resource.',
      });
    }
    if (req.dbUser.accountStatus === 'suspended') {
      return res.status(403).json({
        error: 'Forbidden: Suspended administrator accounts cannot access the console.',
      });
    }
    next();
  });
};

export function requirePermission(permission: AdminPermission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser || !hasPermission(req.dbUser.role, permission)) {
      return res.status(403).json({
        error: `Forbidden: Your role (${req.dbUser?.role || 'unknown'}) lacks the "${permission}" permission.`,
      });
    }
    next();
  };
}

export function requireRecentReauth(maxAgeSeconds = 1800) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const authTime = req.user?.auth_time;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!authTime || nowSec - authTime > maxAgeSeconds) {
      return res.status(403).json({
        code: 'REAUTH_REQUIRED',
        error:
          'Recent authentication is required for this sensitive action. Please confirm your password or Google sign-in and retry.',
      });
    }
    next();
  };
}
