import type { AdminAudience, AdminAudienceRow } from '@smsgecko/shared';
import { Transaction } from '../../models/Transaction.js';
import { User } from '../../models/User.js';

const DAY = 86_400_000;

type AudienceRow = AdminAudienceRow;

/**
 * Where accounts come from, for ad planning: signups grouped by country and by traffic source, each with how many of
 * them went on to pay and how much they deposited. `days` = signups in the last N days; 0 = all time.
 * Accounts from before tracking have no country/source and are counted under "unknown".
 */
export async function getAudience(days: number): Promise<AdminAudience> {
  const match: Record<string, unknown> = { role: 'user' };
  if (days > 0) match.createdAt = { $gte: new Date(Date.now() - days * DAY) };

  const users = await User.find(match).select('_id signupCountry signupSource.channel').lean();
  const ids = users.map((u) => u._id);
  const deposits = ids.length
    ? await Transaction.aggregate<{ _id: unknown; t: number }>([
        { $match: { type: 'deposit', userId: { $in: ids } } },
        { $group: { _id: '$userId', t: { $sum: '$amountMicro' } } },
      ])
    : [];
  const paid = new Map(deposits.map((d) => [String(d._id), d.t]));

  const countries = new Map<string, AudienceRow>();
  const sources = new Map<string, AudienceRow>();
  const countryBySource = new Map<string, Map<string, number>>();
  const add = (m: Map<string, AudienceRow>, key: string, micro: number) => {
    const r = m.get(key) ?? { key, signups: 0, payers: 0, depositsMicro: 0 };
    r.signups += 1;
    if (micro > 0) {
      r.payers += 1;
      r.depositsMicro += micro;
    }
    m.set(key, r);
  };
  for (const u of users) {
    const micro = paid.get(String(u._id)) ?? 0;
    const country = u.signupCountry ?? 'unknown';
    const source = u.signupSource?.channel ?? 'unknown';
    add(countries, country, micro);
    add(sources, source, micro);
    const per = countryBySource.get(source) ?? new Map<string, number>();
    per.set(country, (per.get(country) ?? 0) + 1);
    countryBySource.set(source, per);
  }

  const sort = (m: Map<string, AudienceRow>) => [...m.values()].sort((a, b) => b.signups - a.signups || b.depositsMicro - a.depositsMicro);
  return {
    days,
    totalSignups: users.length,
    tracked: users.filter((u) => u.signupCountry || u.signupSource).length,
    countries: sort(countries),
    sources: sort(sources).map((s) => ({
      ...s,
      /** The three countries that source brings most signups from. */
      topCountries: [...(countryBySource.get(s.key) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([country, n]) => ({ country, signups: n })),
    })),
  };
}
