'use client';

import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat';
import { Badge } from '@/components/ui/badge';
import { LoadingRow } from '@/components/ui/spinner';
import { formatUsd, microToUsd } from '@/lib/format';
import { useAdminOverview } from '@/lib/admin-hooks';

const ACCENT = '#35d07f';
const AXIS = '#5e6a62';
const tick = (d: string) => {
  const dt = new Date(d);
  return `${dt.toLocaleString('en', { month: 'short' })} ${dt.getDate()}`;
};

export default function AdminOverviewPage() {
  const { data, isLoading } = useAdminOverview();
  if (isLoading || !data) return <LoadingRow />;

  const series = data.series.map((s) => ({
    ...s,
    revenueUsd: microToUsd(s.revenueMicro),
  }));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl font-bold">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Users" value={data.usersTotal} icon={<span>☺</span>} />
        <StatTile label="Orders" value={data.ordersTotal} icon={<span>▤</span>} />
        <StatTile label="Active" value={data.activeOrders} accent="accent" icon={<span>◔</span>} />
        <StatTile
          label="Success"
          value={`${Math.round(data.successRate * 100)}%`}
          accent="success"
          icon={<span>✓</span>}
        />
        <StatTile label="Revenue (deposits)" value={formatUsd(data.revenueMicro, { maxDecimals: 2 })} accent="success" />
        <StatTile label="Order spend" value={formatUsd(data.spendMicro, { maxDecimals: 2 })} />
        <StatTile label="Refunded" value={formatUsd(data.refundMicro, { maxDecimals: 2 })} />
        <StatTile
          label="Gross margin"
          value={formatUsd(data.grossMarginMicro, { maxDecimals: 2 })}
          accent="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Orders</h3>
            <span className="text-[11px] uppercase tracking-widest text-faint">30 days</span>
          </div>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="ao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: AXIS, fontSize: 11 }} interval={6} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={ttip} labelFormatter={(l) => tick(String(l))} />
                <Area type="monotone" dataKey="orders" stroke={ACCENT} strokeWidth={2} fill="url(#ao)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Revenue</h3>
            <span className="text-[11px] uppercase tracking-widest text-faint">30 days</span>
          </div>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: AXIS, fontSize: 11 }} interval={6} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                <Tooltip contentStyle={ttip} labelFormatter={(l) => tick(String(l))} formatter={(v) => [formatUsd(Math.round((v as number) * 1e6)), 'Revenue']} />
                <Bar dataKey="revenueUsd" fill={ACCENT} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-sm font-semibold">Provider health</h3>
          <Link href="/admin/providers" className="text-sm text-accent">
            Manage →
          </Link>
        </div>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-faint">
              <th className="px-5 py-2.5 font-medium">Provider</th>
              <th className="px-5 py-2.5 font-medium">Priority</th>
              <th className="px-5 py-2.5 font-medium">Health</th>
              <th className="px-5 py-2.5 font-medium">Rented</th>
              <th className="px-5 py-2.5 font-medium">Errors</th>
              <th className="px-5 py-2.5 font-medium">OTPs</th>
            </tr>
          </thead>
          <tbody>
            {data.providers.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-5 py-3">
                  {p.label}{' '}
                  {p.enabled ? (
                    <Badge tone="success">on</Badge>
                  ) : (
                    <Badge tone="muted">off</Badge>
                  )}
                </td>
                <td className="px-5 py-3 text-muted">{p.priority}</td>
                <td className="px-5 py-3">
                  {p.healthOk === null ? (
                    <span className="text-faint">untested</span>
                  ) : p.healthOk ? (
                    <Badge tone="success">ok</Badge>
                  ) : (
                    <Badge tone="danger">down</Badge>
                  )}
                </td>
                <td className="px-5 py-3 font-mono">{p.rentSuccess}</td>
                <td className="px-5 py-3 font-mono text-danger">{p.rentError}</td>
                <td className="px-5 py-3 font-mono">{p.otpReceived}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const ttip = {
  background: '#0f1512',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 12,
  fontSize: 12,
  color: '#e9eeea',
} as const;
