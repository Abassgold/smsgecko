import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { signUnsubscribeToken } from './broadcastUnsubscribe.js';
import { isSuppressed, type EmailCategory } from './emailSuppression.js';

export const SUPPORT_EMAIL = 'support@smsgecko.com';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Decides which suppression rules apply — see models/EmailSuppression. Defaults to transactional. */
  category?: EmailCategory;
}

let client: Transporter | null = null;
function transporter(): Transporter {
  if (!client) {
    client = nodemailer.createTransport({
      host: env.SES_SMTP_HOST,
      port: env.SES_SMTP_PORT,
      secure: env.SES_SMTP_PORT === 465,
      auth: { user: env.SES_SMTP_USER, pass: env.SES_SMTP_PASS },
    });
  }
  return client;
}

/**
 * Resolves `true` once the message is handed to SES (or logged, when SES isn't
 * configured), `false` if it was skipped because SES reported the address as
 * undeliverable or as a spam complainer.
 */
export async function sendEmail({ to, subject, html, text, headers, category = 'transactional' }: SendArgs): Promise<boolean> {
  if (await isSuppressed(to, category)) {
    logger.info({ to, subject, category }, '[email] skipped — address is on the suppression list');
    return false;
  }

  if (!env.SES_SMTP_HOST || !env.SES_SMTP_USER || !env.SES_SMTP_PASS) {
    logger.warn({ to, subject }, '[email] SES SMTP unset — logging instead of sending');
    logger.info({ to, subject, text }, '[email] (not sent)');
    return true;
  }

  try {
    await transporter().sendMail({ from: env.EMAIL_FROM, to, subject, html, text, headers });
  } catch (error) {
    logger.error({ error }, '[email] SES send failed');
    throw new Error(`SES send failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
}

/** Terms / Privacy / support footer shared by every message we send. */
function footer() {
  const base = env.APP_URL.replace(/\/$/, '');
  const terms = `${base}/terms`;
  const privacy = `${base}/privacy`;
  return {
    html: `<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">SMSGecko &middot; <a href="${terms}" style="color:#64748b">Terms</a> &middot; <a href="${privacy}" style="color:#64748b">Privacy</a> &middot; Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#64748b">${SUPPORT_EMAIL}</a></p>`,
    text: `\n\nSMSGecko\nTerms: ${terms}\nPrivacy: ${privacy}\nQuestions? ${SUPPORT_EMAIL}`,
  };
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
  const f = footer();
  await sendEmail({ to, subject, html: html.replace(/<\/div>$/, `${f.html}\n</div>`), text: text + f.text });
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
  const f = footer();
  await sendEmail({ to, subject, html: html.replace(/<\/div>$/, `${f.html}\n</div>`), text: text + f.text });
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Resolves `false` when the recipient is suppressed and nothing was sent. */
export async function sendBroadcastEmail(to: string, userId: string, subject: string, bodyText: string): Promise<boolean> {
  const unsubscribeUrl = `${env.API_PUBLIC_URL}/api/v1/unsubscribe?token=${signUnsubscribeToken(userId)}`;
  const escapedBody = escapeHtml(bodyText).replace(/\n/g, '<br>');
  const f = footer();

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <p style="margin:0 0 20px;line-height:1.6;color:#0f172a">${escapedBody}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="margin:0;font-size:12px;color:#94a3b8">
    You're receiving this because you have an SMSGecko account.
    <a href="${unsubscribeUrl}" style="color:#64748b">Unsubscribe from these emails</a>.
  </p>
  ${f.html}
</div>`;
  const text = `${bodyText}\n\n—\nUnsubscribe from these emails: ${unsubscribeUrl}${f.text}`;

  return sendEmail({
    to,
    subject,
    html,
    text,
    category: 'broadcast',
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
