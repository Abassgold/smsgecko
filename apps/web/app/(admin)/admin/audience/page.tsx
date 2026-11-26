'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminAudienceRow } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatBalanceUsd } from '@/lib/format';
import { useAdminAudience } from '@/lib/admin-hooks';
import { countryLabel } from '@/lib/country';

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '0', label: 'All time' },
];

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

function StatBox({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-widest text-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </Card>
  );
}

function AudienceTable({ rows, label, render, extra }: { rows: AdminAudienceRow[]; label: string; render: (r: AdminAudienceRow) => React.ReactNode; extra?: (r: AdminAudienceRow) => React.ReactNode }) {
  const max = Math.max(0, ...rows.map((r) => r.signups));
  return (
    <table className="w-full min-w-[760px] text-sm">
      <thead>
        <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
          <th className="px-4 py-3 font-medium">{label}</th>
          <th className="px-4 py-3 text-right font-medium">Signups</th>
          <th className="w-[20%] px-4 py-3 font-medium" />
          <th className="px-4 py-3 text-right font-medium">Paid</th>
          <th className="px-4 py-3 text-right font-medium">Paid rate</th>
          <th className="px-4 py-3 text-right font-medium">Deposits</th>
          {extra ? <th className="px-4 py-3 font-medium">Top countries</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-border last:border-0">
            <td className="whitespace-nowrap px-4 py-3 font-medium">{render(r)}</td>
            <td className="px-4 py-3 text-right font-mono">{r.signups}</td>
            <td className="px-4 py-3">
              <div className="h-1.5 w-full rounded-full bg-surface-2">
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${max > 0 ? Math.max(2, (r.signups / max) * 100) : 0}%` }} />
              </div>
            </td>
            <td className="px-4 py-3 text-right font-mono">{r.payers}</td>
            <td className="px-4 py-3 text-right font-mono text-muted">{pct(r.payers, r.signups)}</td>
            <td className="px-4 py-3 text-right font-mono">{formatBalanceUsd(r.depositsMicro)}</td>
            {extra ? <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{extra(r)}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminAudiencePage() {
  const [days, setDays] = useState('30');
  const { data, isLoading } = useAdminAudience(Number(days));
  const top = data?.countries.find((c) => c.key !== 'unknown');
  const topPaying = data ? [...data.countries].filter((c) => c.key !== 'unknown').sort((a, b) => b.depositsMicro - a.depositsMicro)[0] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Audience</h1>
      <p className="-mt-4 text-sm text-muted">
        Where new accounts sign up from (country from their IP at signup) and what brought them (utm tags, ad click,
        referring site). Judge ads by paid rate and deposits, not signups alone. Accounts created before tracking
        started show as Unknown.
      </p>

      <Tabs items={RANGES} value={days} onChange={setDays} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBox label="Signups" value={data?.totalSignups ?? '…'} sub={data ? `${data.tracked} with location` : undefined} />
        <StatBox label="Top country" value={top ? countryLabel(top.key) : '—'} sub={top ? `${top.signups} signups` : undefined} />
        <StatBox
          label="Top paying country"
          value={topPaying && topPaying.depositsMicro > 0 ? countryLabel(topPaying.key) : '—'}
          sub={topPaying && topPaying.depositsMicro > 0 ? formatBalanceUsd(topPaying.depositsMicro) : undefined}
        />
        <StatBox label="Top source" value={data?.sources.find((s) => s.key !== 'unknown')?.key ?? '—'} />
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">By country</h2>
        <Card className="overflow-x-auto">
          {isLoading ? (
            <LoadingRow />
          ) : !data || data.countries.length === 0 ? (
            <EmptyState title="No signups in this range" />
          ) : (
            <AudienceTable
              rows={data.countries}
              label="Country"
              render={(r) => <Link className="hover:underline" href={`/admin/users?country=${r.key}`}>{countryLabel(r.key)}</Link>}
            />
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-1 font-display text-lg font-semibold">By source</h2>
        <p className="mb-3 text-sm text-muted">
          Tag ad links so they show here, e.g. <code className="rounded bg-surface-2 px-1">?utm_source=facebook&amp;utm_campaign=ng-launch</code>.
          Google and Facebook ad clicks are recognised on their own.
        </p>
        <Card className="overflow-x-auto">
          {data && data.sources.length > 0 ? (
            <AudienceTable
              rows={data.sources}
              label="Source"
              render={(r) => (r.key === 'unknown' ? 'Unknown' : r.key)}
              extra={(r) => (data.sources.find((s) => s.key === r.key)?.topCountries ?? []).map((c) => `${countryLabel(c.country, false)} ${c.signups}`).join(' · ')}
            />
          ) : isLoading ? <LoadingRow /> : <EmptyState title="No signups in this range" />}
        </Card>
      </div>
    </div>
  );
}
