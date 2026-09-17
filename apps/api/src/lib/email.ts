import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { signUnsubscribeToken } from './broadcastUnsubscribe.js';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

export async function sendEmail({ to, subject, html, text, headers }: SendArgs): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.warn({ to, subject }, '[email] RESEND_API_KEY unset — logging instead of sending');
    logger.info({ to, subject, text }, '[email] (not sent)');
    return;
  }

  const { error } = await resend().emails.send({ from: env.EMAIL_FROM, to, subject, html, text, headers });

  if (error) {
    logger.error({ error }, '[email] Resend send failed');
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  const subject = 'Verify your SMSGecko email';
  const text = `Welcome to SMSGecko!\n\nConfirm this address to activate your account:\n${link}\n\nThis link expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes. If you didn't sign up, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 12px">Verify your email</h1>
  <p style="margin:0 0 20px;line-height:1.5;color:#475569">Confirm this address to activate your SMSGecko account.</p>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Verify email</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b">Or paste this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#2563eb">${link}</a></p>
  <p style="margin:0;font-size:12px;color:#94a3b8">This link expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes. If you didn't sign up, ignore this email.</p>
</div>`;
  await sendEmail({ to, subject, html, text });
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  const subject = 'Reset your SMSGecko password';
  const text = `We got a request to reset your SMSGecko password.\n\nChoose a new password here:\n${link}\n\nThis link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email — your password won't change.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
  <p style="margin:0 0 20px;line-height:1.5;color:#475569">We got a request to reset your SMSGecko password.</p>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Reset password</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b">Or paste this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#2563eb">${link}</a></p>
  <p style="margin:0;font-size:12px;color:#94a3b8">This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes. If you didn't request this, ignore this email — your password won't change.</p>
</div>`;
  await sendEmail({ to, subject, html, text });
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Admin broadcast — `bodyText` is plain text an admin typed in, never raw
 * HTML, so there's no admin-authored-markup-in-email risk; it's escaped and
 * wrapped in the same styled template as every other email here, with line
 * breaks preserved. Carries a real one-click unsubscribe: both a visible
 * link in the body and the `List-Unsubscribe` / `List-Unsubscribe-Post`
 * headers mail clients use to offer their own one-click unsubscribe button
 * — required by CAN-SPAM/GDPR/CASL for anything that isn't purely
 * transactional, which this isn't.
 */
export async function sendBroadcastEmail(to: string, userId: string, subject: string, bodyText: string): Promise<void> {
  const unsubscribeUrl = `${env.API_PUBLIC_URL}/api/v1/unsubscribe?token=${signUnsubscribeToken(userId)}`;
  const escapedBody = escapeHtml(bodyText).replace(/\n/g, '<br>');

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <p style="margin:0 0 20px;line-height:1.6;color:#0f172a">${escapedBody}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="margin:0;font-size:12px;color:#94a3b8">
    You're receiving this because you have an SMSGecko account.
    <a href="${unsubscribeUrl}" style="color:#64748b">Unsubscribe from these emails</a>.
  </p>
</div>`;
  const text = `${bodyText}\n\n—\nUnsubscribe from these emails: ${unsubscribeUrl}`;

  await sendEmail({
    to,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
