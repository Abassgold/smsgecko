'use client';

import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { ApiError } from '@/lib/api';
import { useDisableTwoFactor, useEnableTwoFactor, useMe, useSetupTwoFactor } from '@/lib/hooks';

type Step = 'idle' | 'setup' | 'recovery';

export function TwoFactor() {
  const me = useMe();
  const setup = useSetupTwoFactor();
  const enable = useEnableTwoFactor();
  const disable = useDisableTwoFactor();

  const [step, setStep] = useState<Step>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    const uri = setup.data?.otpauthUrl;
    if (!uri) return;
    let cancelled = false;
    toDataURL(uri, { margin: 1, width: 220 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [setup.data?.otpauthUrl]);

  if (me.isLoading || !me.data) {
    return (
      <Card className="p-6">
        <SectionTitle>Two-factor authentication</SectionTitle>
      </Card>
    );
  }
  const enabled = me.data.user.twoFactorEnabled;

  const startSetup = () => {
    setStep('setup');
    setCode('');
    setQrDataUrl(null);
    setup.mutate();
  };

  const cancelSetup = () => {
    setStep('idle');
    setup.reset();
  };

  const confirmEnable = (e: React.FormEvent) => {
    e.preventDefault();
    enable.mutate(
      { code: code.trim() },
      {
        onSuccess: (data) => {
          setRecoveryCodes(data.recoveryCodes);
          setStep('recovery');
        },
      },
    );
  };

  const finishRecovery = () => {
    setStep('idle');
    setQrDataUrl(null);
    setRecoveryCodes(null);
    setup.reset();
    enable.reset();
  };

  const submitDisable = (e: React.FormEvent) => {
    e.preventDefault();
    disable.mutate(
      { password, code: disableCode.trim() },
      {
        onSuccess: () => {
          setDisabling(false);
          setPassword('');
          setDisableCode('');
        },
      },
    );
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <SectionTitle>Two-factor authentication</SectionTitle>
        <Badge tone={enabled ? 'success' : 'muted'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        Require a code from an authenticator app (Google Authenticator, 1Password, Authy, …) in
        addition to your password when signing in.
      </p>

      {step === 'idle' && !enabled ? (
        <Button className="mt-4" onClick={startSetup} disabled={setup.isPending}>
          {setup.isPending ? 'Starting…' : 'Enable'}
        </Button>
      ) : null}

      {step === 'setup' ? (
        <div className="mt-4 flex flex-col gap-4">
          {setup.isError ? (
            <p className="text-sm text-danger">
              {setup.error instanceof ApiError ? setup.error.message : 'Could not start setup'}
            </p>
          ) : (
            <>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a generated data: URI, not an optimizable asset
                <img
                  src={qrDataUrl}
                  alt="Scan with your authenticator app"
                  width={220}
                  height={220}
                  className="rounded-xl border border-border bg-white p-2"
                />
              ) : null}
              {setup.data?.secret ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-faint">Can&apos;t scan? Enter this manually:</span>
                  <code className="truncate rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs">
                    {setup.data.secret}
                  </code>
                  <CopyButton value={setup.data.secret} />
                </div>
              ) : null}
              <form className="flex flex-col gap-3" onSubmit={confirmEnable}>
                <Field label="Code from your app" hint="6 digits, refreshes every 30 seconds.">
                  <TextInput
                    inputMode="numeric"
                    placeholder="123456"
                    disabled={enable.isPending}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                {enable.isError ? (
                  <p className="text-sm text-danger">
                    {enable.error instanceof ApiError ? enable.error.message : 'Incorrect code'}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button type="submit" disabled={enable.isPending}>
                    {enable.isPending ? 'Confirming…' : 'Confirm'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={cancelSetup}>
                    Cancel
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      ) : null}

      {step === 'recovery' && recoveryCodes ? (
        <div className="mt-4 rounded-xl border border-[var(--accent-ring)]/40 bg-accent-soft p-4">
          <div className="text-xs text-faint">
            Save these recovery codes somewhere safe — each works once, in place of a code from
            your app, and this is the only time they&apos;re shown.
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
            {recoveryCodes.map((c) => (
              <span key={c} className="rounded-lg bg-bg px-2 py-1">{c}</span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <CopyButton value={recoveryCodes.join('\n')} label="Copy all" />
            <Button size="sm" onClick={finishRecovery}>Done</Button>
          </div>
        </div>
      ) : null}

      {step === 'idle' && enabled ? (
        disabling ? (
          <form className="mt-4 flex flex-col gap-3" onSubmit={submitDisable}>
            <Field label="Password">
              <TextInput
                type="password"
                autoComplete="current-password"
                disabled={disable.isPending}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Code" hint="From your app, or a recovery code.">
              <TextInput
                disabled={disable.isPending}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
              />
            </Field>
            {disable.isError ? (
              <p className="text-sm text-danger">
                {disable.error instanceof ApiError ? disable.error.message : 'Could not disable 2FA'}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={disable.isPending}>
                {disable.isPending ? 'Disabling…' : 'Disable'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button className="mt-4" variant="secondary" onClick={() => setDisabling(true)}>
            Disable
          </Button>
        )
      ) : null}
    </Card>
  );
}
