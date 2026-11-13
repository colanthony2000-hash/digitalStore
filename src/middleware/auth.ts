import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  fullName: string | null;
  role: string;
}

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

export async function syncFirebaseUser(decoded: DecodedIdToken): Promise<DbUser> {
  const email = decoded.email || `${decoded.uid}@users.jeneconk.com`;
  const fullName = decoded.name || null;
  const shouldBootstrapAdmin = decoded.email_verified && isBootstrappedAdminEmail(email);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.uid, decoded.uid))
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    const nextRole =
      shouldBootstrapAdmin && current.role !== 'admin' ? 'admin' : current.role;

    const updated = await db
      .update(users)
      .set({
        email,
        fullName: current.fullName || fullName,
        role: nextRole,
        updatedAt: new Date(),
      })
      .where(eq(users.id, current.id))
      .returning();

    return updated[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      uid: decoded.uid,
      email,
      fullName,
      role: shouldBootstrapAdmin ? 'admin' : 'customer',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        updatedAt: new Date(),
      },
    })
    .returning();

  return inserted[0];
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
    req.user = decodedToken;
    req.dbUser = await syncFirebaseUser(decodedToken);
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session.' });
  }
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
    req.user = decodedToken;
    req.dbUser = await syncFirebaseUser(decodedToken);
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
    if (!req.dbUser || req.dbUser.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Administrator access is required for this resource.',
      });
    }
    next();
  });
};
