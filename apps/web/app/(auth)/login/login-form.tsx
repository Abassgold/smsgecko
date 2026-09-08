'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLogin } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AuthLogo } from '../auth-logo';
import { PasswordField, SubmitButton } from '../auth-ui';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { identifier: identifier.trim(), password },
      { onSuccess: () => router.replace(params.get('next') || '/dashboard') },
    );
  };

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

        <SubmitButton label="Sign in" loading={login.isPending} />

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <span>·</span>
          <Link href="/register">Create account</Link>
        </div>
      </form>
    </>
  );
}
