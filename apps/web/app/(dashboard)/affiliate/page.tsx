'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { LoadingRow } from '@/components/ui/spinner';
import { formatUsd } from '@/lib/format';
import { useAcceptAffiliateTerms, useAffiliate } from '@/lib/hooks';

export default function AffiliatePage() {
  const affiliate = useAffiliate();
  const accept = useAcceptAffiliateTerms();
  const [checked, setChecked] = useState(false);

  if (affiliate.isLoading || !affiliate.data) return <LoadingRow />;
  const a = affiliate.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-success">Partner earnings</div>
          <h1 className="font-display text-2xl font-bold">Affiliate</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={a.termsAccepted ? 'success' : 'warning'}>
            {a.termsAccepted ? 'Active' : 'Pending terms'}
          </Badge>
          <Badge tone="default">{(a.rate * 100).toFixed(2)}% rate</Badge>
        </div>
      </div>

      {!a.termsAccepted ? (
        <Card className="p-6">
          <div className="font-display text-base font-semibold">
            Accept the current terms before sharing
          </div>
          <p className="mt-1 text-sm text-muted">
            Your code is reserved, but referral attribution and earnings are not active yet.
          </p>
          <div className="mt-4 text-xs uppercase tracking-widest text-faint">
            Current version: {a.currentTermsVersion}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            I confirm that I have read the current Terms and Privacy Policy.
          </label>
          <Button
            className="mt-4"
            disabled={!checked || accept.isPending}
            onClick={() => accept.mutate(a.currentTermsVersion)}
          >
            {accept.isPending ? 'Saving…' : 'Accept current terms'}
          </Button>
        </Card>
      ) : null}

      <Card className="p-6">
        <div className="text-xs uppercase tracking-widest text-success">Referral identity</div>
        <div className="mt-1 font-display text-base font-semibold">Your code and link</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="text-[11px] uppercase tracking-widest text-faint">Code</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono">{a.code}</span>
              <CopyButton value={a.code} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="text-[11px] uppercase tracking-widest text-faint">Link</div>
            <div className="mt-1 flex items-center gap-2">
              {a.link ? (
                <>
                  <span className="truncate font-mono text-xs">{a.link}</span>
                  <CopyButton value={a.link} />
                </>
              ) : (
                <span className="font-mono text-xs text-faint">Unavailable until eligible</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="font-display text-base font-semibold">Referral funnel</div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <Metric label="Signups" value={String(a.funnel.signups)} />
          <Metric label="Activated" value={String(a.funnel.activated)} />
          <Metric label="Earnings" value={formatUsd(a.funnel.earningsMicro)} />
        </div>
      </Card>

      <Link href="/dashboard" className="text-sm text-accent">
        ← Dashboard
      </Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-faint">{label}</div>
    </div>
  );
}
