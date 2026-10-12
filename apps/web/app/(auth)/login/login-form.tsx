'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLogin, useVerifyTwoFactor } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AuthLogo } from '../auth-logo';
import { PasswordField, SubmitButton } from '../auth-ui';

export function LoginForm() {
  const params = useSearchParams();
  const login = useLogin();
  const verifyTwoFactor = useVerifyTwoFactor();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  // Full page load, not router.replace: a soft navigation can reuse a /dashboard prefetch cached while
  // signed out (a redirect to /login), which leaves the user sitting on the form after a good login.
  const goToNext = () => {
    const next = params.get('next');
    setRedirecting(true);
    window.location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { identifier: identifier.trim(), password },
      {
        onSuccess: (data) => {
          if ('twoFactorRequired' in data) {
            setPendingToken(data.pendingToken);
          } else {
            goToNext();
          }
        },
      },
    );
  };

  const onVerify = (e: React.FormEvent) => {
    e.preventDefault();
    verifyTwoFactor.mutate({ pendingToken: pendingToken!, code: code.trim() }, { onSuccess: goToNext });
  };

  if (pendingToken) {
    const error = verifyTwoFactor.isError
      ? verifyTwoFactor.error instanceof ApiError
        ? verifyTwoFactor.error.message
        : 'Could not verify that code'
      : '';

    return (
      <>
        <AuthLogo />
        <h1 className="auth-title">Two-factor authentication</h1>
        <p className="auth-subtitle">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </p>

        <div className={cn('auth-error', error && 'visible')} role="alert">
          {error}
        </div>

        <form className="auth-form" onSubmit={onVerify}>
          <div className="field">
            <label htmlFor="login-2fa-code">Code</label>
            <input
              id="login-2fa-code"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              required
              autoFocus
              autoComplete="one-time-code"
              disabled={verifyTwoFactor.isPending}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <SubmitButton label="Verify" loading={verifyTwoFactor.isPending || redirecting} />

          <div className="auth-links">
            <button
              type="button"
              onClick={() => {
                setPendingToken(null);
                setCode('');
              }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </>
    );
  }

  const error = login.isError
    ? login.error instanceof ApiError
      ? login.error.message
      : 'Sign in failed'
    : '';

  return (
    <>
      <AuthLogo />
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-subtitle">Sign in to your SMSGecko account</p>

      <div className={cn('auth-error', error && 'visible')} role="alert">
        {error}
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="login-identifier">Email or username</label>
          <input
            id="login-identifier"
            type="text"
            placeholder="you@example.com or username"
            required
            autoComplete="username"
            disabled={login.isPending}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>

        <PasswordField
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          disabled={login.isPending}
          value={password}
          onChange={setPassword}
        />

        <label className="remember-row">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember me
        </label>

        <SubmitButton label="Sign in" loading={login.isPending || redirecting} />

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <span>·</span>
          <Link href="/register">Create account</Link>
        </div>
      </form>
    </>
  );
}
