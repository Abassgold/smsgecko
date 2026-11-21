/**
 * Country rerouting for specific service×country combos on the SMS-Activate-style
 * resellers. Ported from FloZap's `changeCountryRoute` (`changeRoute`).
 *
 * Why: these providers have poor / unreliable **US (187)** stock for WhatsApp, so a
 * US WhatsApp request is served from **Canada (36)** instead — a Canadian +1 number
 * verifies US WhatsApp fine. The customer still picks "USA / WhatsApp" and never
 * has to know.
 *
 * Which providers: hero_sms, tiger_sms and sms_bower. (FloZap leaves smsbower on the
 * country the customer picked; SMSGecko reroutes it too, on purpose.)
 *
 * Applied to the provider's own numeric codes (i.e. AFTER mapService/mapCountry),
 * in THREE places so what is quoted is what is bought:
 *  - `changeRoute` on the rent (which country is actually purchased),
 *  - `changeRoute` on a single-country price lookup (the price cap comes from it),
 *  - `rerouteListing` on an all-countries price listing (so the catalog shows the
 *    price of the country that will really be rented, not the unused US price).
 *
 * Everything that isn't an explicitly-rerouted combo passes through unchanged.
 */
const ROUTES: ReadonlyArray<{ service: string; from: string; to: string }> = [
  // USA (187) + WhatsApp (wa) -> Canada (36)
  { service: 'wa', from: '187', to: '36' },
];

export function changeRoute(providerCountry: string, providerService: string): string {
  const country = String(providerCountry).trim();
  const service = String(providerService).trim().toLowerCase();
  return ROUTES.find((r) => r.service === service && r.from === country)?.to ?? providerCountry;
}

/** The countries a customer-facing country can be served from (its own, plus any reroute destinations). */
export function routeSources(providerCountry: string): string[] {
  const country = String(providerCountry).trim();
  return [country, ...ROUTES.filter((r) => r.from === country).map((r) => r.to)];
}

/**
 * An all-countries price listing for one service, with every rerouted country
 * showing the destination's tiers under the original code. If the destination has
 * nothing on sale the original country is dropped: renting it would fail, so it
 * must not look available. Rows are `{ countryCode, … }`; the input is not mutated.
 */
export function rerouteListing<T extends { countryCode: string }>(rows: T[], providerService: string): T[] {
  const service = String(providerService).trim().toLowerCase();
  let out = rows;
  for (const r of ROUTES) {
    if (r.service !== service) continue;
    const dest = out.filter((x) => String(x.countryCode) === r.to);
    out = out
      .filter((x) => String(x.countryCode) !== r.from)
      .concat(dest.map((x) => ({ ...x, countryCode: r.from })));
  }
  return out;
}
