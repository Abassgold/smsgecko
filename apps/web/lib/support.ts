/** SMSGecko's Telegram support chat. Override with NEXT_PUBLIC_TELEGRAM_SUPPORT_URL (any https://t.me/<handle> link). */
export const TELEGRAM_SUPPORT_URL = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT_URL || 'https://t.me/Smsgecko';

/** "@Smsgecko", read from the link, for showing next to it. */
export const TELEGRAM_SUPPORT_HANDLE = `@${TELEGRAM_SUPPORT_URL.replace(/\/+$/, '').split('/').pop() ?? ''}`;
