import nodemailer from 'nodemailer';
import { db } from '../db/index.ts';
import { emailLogs, storeSettings } from '../db/schema.ts';
import { isPlaceholderValue } from './integrations.ts';
import { recordSystemEvent } from './telemetry.ts';

export interface EmailIntegrationStatus {
  configured: boolean;
  provider: 'smtp' | 'resend' | 'unconfigured';
  supportAddress: string;
  businessAddress: string;
  fromAddress: string;
  firebaseAuthEmailActive: boolean;
  smtpHostConfigured: boolean;
  resendConfigured: boolean;
  detailMessage: string;
}

export async function getEmailIdentities(): Promise<{
  supportAddress: string;
  businessAddress: string;
  fromAddress: string;
}> {
  const rows = await db.select().from(storeSettings);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const supportAddress =
    (map.support_email && map.support_email.trim()) || 'info@jeneconk.com';
  const businessAddress =
    (map.business_email && map.business_email.trim()) || 'business@jeneconk.com';
  const envFrom = (process.env.SMTP_FROM || '').trim();
  const fromAddress = !isPlaceholderValue(envFrom)
    ? envFrom
    : `Jeneconk Digital Store <${supportAddress}>`;

  return { supportAddress, businessAddress, fromAddress };
}

export async function getEmailIntegrationStatus(): Promise<EmailIntegrationStatus> {
  const { supportAddress, businessAddress, fromAddress } = await getEmailIdentities();

  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();

  const smtpHostConfigured =
    !isPlaceholderValue(smtpHost) &&
    !isPlaceholderValue(smtpUser) &&
    !isPlaceholderValue(smtpPass);

  const resendConfigured = !isPlaceholderValue(resendKey) && resendKey.length >= 12;

  const provider: 'smtp' | 'resend' | 'unconfigured' = smtpHostConfigured
    ? 'smtp'
    : resendConfigured
    ? 'resend'
    : 'unconfigured';

  return {
    configured: provider !== 'unconfigured',
    provider,
    supportAddress,
    businessAddress,
    fromAddress,
    firebaseAuthEmailActive: true,
    smtpHostConfigured,
    resendConfigured,
    detailMessage:
      provider === 'smtp'
        ? `SMTP relay configured via ${smtpHost}.`
        : provider === 'resend'
        ? 'Resend transactional email API configured.'
        : 'No external SMTP or transactional email API key is configured. Firebase Authentication still sends customer verification and password-reset emails natively.',
  };
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  category:
    | 'support_notification'
    | 'verification_notice'
    | 'password_reset_notice'
    | 'purchase_receipt'
    | 'admin_alert'
    | 'test_email';
  replyTo?: string;
  fromIdentity?: 'support' | 'business';
}): Promise<{
  sent: boolean;
  status: 'sent' | 'failed' | 'not_configured';
  provider: 'smtp' | 'resend' | 'unconfigured';
  errorMessage?: string;
}> {
  const statusInfo = await getEmailIntegrationStatus();
  const senderEmail =
    params.fromIdentity === 'business'
      ? statusInfo.businessAddress
      : statusInfo.supportAddress;
  const fromAddress =
    params.fromIdentity === 'business'
      ? `Jeneconk Business <${senderEmail}>`
      : statusInfo.fromAddress;
  const replyTo = params.replyTo || senderEmail;

  if (!statusInfo.configured) {
    const errorMessage =
      'Store email provider is not configured (missing SMTP or RESEND_API_KEY).';
    await db.insert(emailLogs).values({
      recipientEmail: params.to.toLowerCase(),
      fromAddress,
      replyTo,
      subject: params.subject.slice(0, 220),
      category: params.category,
      provider: 'unconfigured',
      status: 'not_configured',
      errorMessage,
    });
    return {
      sent: false,
      status: 'not_configured',
      provider: 'unconfigured',
      errorMessage,
    };
  }

  try {
    if (statusInfo.provider === 'smtp') {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = process.env.SMTP_SECURE === 'true' || port === 465;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure,
        auth: {
          user: process.env.SMTP_USER!.trim(),
          pass: process.env.SMTP_PASS!.trim(),
        },
      });
      await transporter.sendMail({
        from: fromAddress,
        to: params.to,
        replyTo,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
    } else if (statusInfo.provider === 'resend') {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.to],
          reply_to: replyTo,
          subject: params.subject,
          text: params.text,
          html: params.html,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Resend API error (${resp.status}): ${body.slice(0, 300)}`);
      }
    }

    await db.insert(emailLogs).values({
      recipientEmail: params.to.toLowerCase(),
      fromAddress,
      replyTo,
      subject: params.subject.slice(0, 220),
      category: params.category,
      provider: statusInfo.provider,
      status: 'sent',
    });

    return { sent: true, status: 'sent', provider: statusInfo.provider };
  } catch (error: any) {
    const msg = error?.message || 'Email delivery failed.';
    await db.insert(emailLogs).values({
      recipientEmail: params.to.toLowerCase(),
      fromAddress,
      replyTo,
      subject: params.subject.slice(0, 220),
      category: params.category,
      provider: statusInfo.provider,
      status: 'failed',
      errorMessage: msg.slice(0, 500),
    });
    await recordSystemEvent({
      component: 'email',
      severity: 'error',
      eventType: 'email_delivery_failed',
      message: `Email delivery to ${params.to} failed via ${statusInfo.provider}.`,
      details: msg,
    });
    return {
      sent: false,
      status: 'failed',
      provider: statusInfo.provider,
      errorMessage: msg,
    };
  }
}
