'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForgotPassword } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AuthLogo } from '../auth-logo';
import { SubmitButton } from '../auth-ui';

export function ForgotPasswordForm() {
  const forgotPassword = useForgotPassword();
  const [email, setEmail] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forgotPassword.mutate({ email: email.trim() });
  };

  const error = forgotPassword.isError
    ? forgotPassword.error instanceof ApiError
      ? forgotPassword.error.message
      : 'Could not send the reset email'
    : '';

  if (forgotPassword.isSuccess) {
    return (
      <>
        <AuthLogo />
        <h1 className="auth-title">Check your inbox</h1>
        <p className="auth-subtitle">
          If an account exists for {email}, we&apos;ve sent a link to reset your password.
        </p>
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthLogo />
      <h1 className="auth-title">Forgot your password?</h1>
      <p className="auth-subtitle">
        Enter the email on your account and we&apos;ll send you a link to reset it.
      </p>

      <div className={cn('auth-error', error && 'visible')} role="alert">
        {error}
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            disabled={forgotPassword.isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <SubmitButton label="Send reset link" loading={forgotPassword.isPending} />

        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </form>
    </>
  );
}
