import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from './logger.js';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

/**
 * Send one transactional email through the Resend SDK.
 *
 * When RESEND_API_KEY is unset (local dev, tests) the message is logged instead
 * of sent, so the rest of the flow still works offline.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.warn({ to, subject }, '[email] RESEND_API_KEY unset — logging instead of sending');
    logger.info({ to, subject, text }, '[email] (not sent)');
    return;
  }

  const { error } = await resend().emails.send({ from: env.EMAIL_FROM, to, subject, html, text });

  if (error) {
    logger.error({ error }, '[email] Resend send failed');
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  const subject = 'Verify your SMSGecko email';
  const text = `Welcome to SMSGecko!\n\nConfirm this address to activate your account:\n${link}\n\nThis link expires in ${env.EMAIL_VERIFICATION_TTL_HOURS} hours. If you didn't sign up, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 12px">Verify your email</h1>
  <p style="margin:0 0 20px;line-height:1.5;color:#475569">Confirm this address to activate your SMSGecko account.</p>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Verify email</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b">Or paste this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#2563eb">${link}</a></p>
  <p style="margin:0;font-size:12px;color:#94a3b8">This link expires in ${env.EMAIL_VERIFICATION_TTL_HOURS} hours. If you didn't sign up, ignore this email.</p>
</div>`;
  await sendEmail({ to, subject, html, text });
}
