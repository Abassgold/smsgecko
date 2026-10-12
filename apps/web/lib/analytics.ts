/*
 * Google Tag Manager events. GTM itself is loaded once in app/layout.tsx; everything here just pushes onto `window.dataLayer`, which
 * GTM reads (a push is queued if GTM has not loaded yet, and harmless if it never does). Ad pixels (TikTok, Meta, Google) live inside
 * GTM: give each tag a "Custom Event" trigger whose name matches one of the `event` values below.
 *
 * Event names are Google Analytics' standard ones (sign_up, view_item, purchase). Money is in USD, as dollars (not micro-USD).
 */
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

const push = (payload: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  (window.dataLayer = window.dataLayer ?? []).push(payload);
};

const NUMBER_ITEM = { item_id: 'virtual_number', item_name: 'Virtual SMS Number (OTP)' };

/** Who this is, for advanced matching in GTM (ad tags hash the email before sending). Pushed before the event it belongs to. */
export const identifyUser = (user: { email: string }) => {
  push({ event: 'identify', user_data: { email: user.email } });
};

export const trackRegistration = (user: { email: string }) => {
  identifyUser(user);
  push({ event: 'sign_up', method: 'email' });
};

/** Someone opened the buy-a-number screen. */
export const trackNumberView = () => push({ event: 'view_item', items: [NUMBER_ITEM] });

/** A number's code arrived: the purchase is complete. Fires at most once per order per browser. */
export const trackNumberPurchase = (orderId: string, priceMicro: number) => {
  if (typeof window === 'undefined') return;
  const key = `sg_gtm_paid_${orderId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    // storage blocked: fall through and fire (a rare double count beats losing the conversion)
  }
  push({ event: 'purchase', transaction_id: orderId, value: priceMicro / 1_000_000, currency: 'USD', items: [NUMBER_ITEM] });
};
