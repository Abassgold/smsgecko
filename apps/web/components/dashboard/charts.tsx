'use client';

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
import { formatUsd, microToUsd } from '@/lib/format';
import type { OrderStatsResponse } from '@smsgecko/shared';

const ACCENT = '#35d07f';
const AXIS = '#5e6a62';

function tickLabel(date: string) {
  const d = new Date(date);
  return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
}

export function OrderCharts({ series }: { series: OrderStatsResponse['series'] }) {
  const data = series.map((s) => ({ ...s, spendUsd: microToUsd(s.spendMicro) }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Orders</h3>
          <span className="text-[11px] uppercase tracking-widest text-faint">Last 30 days</span>
        </div>
        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={tickLabel}
                tick={{ fill: AXIS, fontSize: 11 }}
                interval={6}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: AXIS, fontSize: 11 }}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => tickLabel(String(l))}
                formatter={(v) => [v as number, 'Orders']}
              />
              <Area
                type="monotone"
                dataKey="orders"
                stroke={ACCENT}
                strokeWidth={2}
                fill="url(#ordersFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Spending</h3>
          <span className="text-[11px] uppercase tracking-widest text-faint">Last 30 days</span>
        </div>
        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="date"
                tickFormatter={tickLabel}
                tick={{ fill: AXIS, fontSize: 11 }}
                interval={6}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => tickLabel(String(l))}
                formatter={(v) => [formatUsd(Math.round((v as number) * 1_000_000)), 'Spend']}
              />
              <Bar dataKey="spendUsd" fill={ACCENT} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

const tooltipStyle = {
  background: '#0f1512',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 12,
  fontSize: 12,
  color: '#e9eeea',
} as const;
