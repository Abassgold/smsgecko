import { randomInt } from 'node:crypto';

export interface RenderedSms {
  sender: string;
  text: string;
  otp: string;
}

interface Template {
  sender: string;
  digits?: number;
  render: (code: string) => string;
}

const TEMPLATES: Record<string, Template> = {
  whatsapp: { sender: 'WhatsApp', digits: 6, render: (c) => `WhatsApp code ${c.slice(0, 3)}-${c.slice(3)}\n\nDon't share this code with others` },
  telegram: { sender: 'Telegram', digits: 5, render: (c) => `Telegram code: ${c}\n\nDo not give this code to anyone, even if they say they are from Telegram!` },
  google: { sender: 'Google', digits: 6, render: (c) => `G-${c} is your Google verification code.` },
  instagram: { sender: 'Instagram', digits: 6, render: (c) => `${c} is your Instagram code. Don't share it.` },
  facebook: { sender: 'Facebook', digits: 5, render: (c) => `${c} is your Facebook confirmation code` },
  tiktok: { sender: 'TikTok', digits: 6, render: (c) => `[TikTok] ${c} is your verification code` },
  twitter: { sender: 'Twitter', digits: 6, render: (c) => `Your Twitter confirmation code is ${c}.` },
  discord: { sender: 'Discord', digits: 6, render: (c) => `Your Discord verification code is: ${c}` },
  openai: { sender: 'OpenAI', digits: 6, render: (c) => `Your OpenAI verification code is ${c}` },
  amazon: { sender: 'Amazon', digits: 6, render: (c) => `${c} is your Amazon OTP. Do not share it with anyone.` },
  netflix: { sender: 'Netflix', digits: 4, render: (c) => `Netflix: Your verification code is ${c}` },
  paypal: { sender: 'PayPal', digits: 6, render: (c) => `PayPal: Your security code is ${c}. Your code expires in 10 minutes.` },
};

const FALLBACK: Template = {
  sender: 'VERIFY',
  digits: 6,
  render: (c) => `Your verification code is ${c}. It expires in 10 minutes.`,
};

function makeCode(digits: number): string {
  let out = '';
  for (let i = 0; i < digits; i++) out += String(randomInt(0, 10));
  return out;
}

export function renderOtpSms(serviceSlug: string): RenderedSms {
  const tpl = TEMPLATES[serviceSlug] ?? FALLBACK;
  const otp = makeCode(tpl.digits ?? 6);
  return { sender: tpl.sender, text: tpl.render(otp), otp };
}

/**
 * Best-effort OTP extraction from arbitrary SMS text. Prefers a 4–8 digit run
 * that sits near a keyword like "code"; falls back to the first digit run.
 * Strips a single separating dash/space inside the run (e.g. "123-456").
 */
export function parseOtp(text: string): string | null {
  const normalized = text.replace(/(\d)[ -](\d)/g, '$1$2');
  const near = normalized.match(/(?:code|otp|pin|is|:)\D{0,6}(\d{4,8})/i);
  if (near?.[1]) return near[1];
  const any = normalized.match(/\b(\d{4,8})\b/);
  return any?.[1] ?? null;
}
