/**
 * Country rerouting for specific service×country combos on the SMS-Activate-style
 * resellers (hero_sms, sms_bower). Ported from FloZap's `changeCountryRoute`.
 *
 * Why: these providers have poor / unreliable **US (187)** stock for WhatsApp, so
 * a US WhatsApp request is served from **Canada (36)** instead — a Canadian +1
 * number verifies US WhatsApp fine. The reroute is applied to the provider's own
 * numeric codes (i.e. AFTER mapService/mapCountry), and to BOTH the price lookup
 * and the rent so the quoted price (and the price cap) always matches the country
 * we actually rent from.
 *
 * Everything that isn't an explicitly-rerouted combo passes through unchanged.
 */
export function changeRoute(providerCountry: string, providerService: string): string {
  const country = String(providerCountry).trim();
  const service = String(providerService).trim().toLowerCase();

  // USA (187) + WhatsApp (wa) -> Canada (36)
  if (country === '187' && service === 'wa') return '36';

  return providerCountry;
}
