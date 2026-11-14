import { db } from '../db/index.ts';
import { accountEvents, systemEvents } from '../db/schema.ts';

export async function recordAccountEvent(params: {
  userId?: number | null;
  email?: string | null;
  eventType: string;
  details?: string | null;
  ipAddress?: string | null;
}) {
  try {
    await db.insert(accountEvents).values({
      userId: params.userId ?? null,
      email: params.email ? params.email.toLowerCase().slice(0, 160) : null,
      eventType: params.eventType.slice(0, 80),
      details: params.details ? params.details.slice(0, 1000) : null,
      ipAddress: params.ipAddress ? params.ipAddress.slice(0, 64) : null,
    });
  } catch (err) {
    console.error('Failed to record account event:', err);
  }
}

export async function recordSystemEvent(params: {
  component:
    | 'application'
    | 'database'
    | 'storage'
    | 'authentication'
    | 'payments'
    | 'email'
    | 'integrations';
  severity?: 'info' | 'warning' | 'error';
  eventType: string;
  message: string;
  details?: string | null;
  resolved?: boolean;
}) {
  try {
    await db.insert(systemEvents).values({
      component: params.component,
      severity: params.severity || 'info',
      eventType: params.eventType.slice(0, 80),
      message: params.message.slice(0, 500),
      details: params.details ? params.details.slice(0, 2000) : null,
      resolved: Boolean(params.resolved),
    });
  } catch (err) {
    console.error('Failed to record system event:', err);
  }
}
