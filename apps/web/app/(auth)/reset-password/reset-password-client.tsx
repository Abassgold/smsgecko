'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useResetPassword } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AuthLogo } from '../auth-logo';
import { PasswordField, SubmitButton } from '../auth-ui';

export function ResetPasswordClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const resetPassword = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    resetPassword.mutate(
      { token: token!, password },
      { onSuccess: () => setTimeout(() => router.replace('/dashboard'), 1200) },
    );
  };

  if (!token) {
    return (
      <>
        <AuthLogo />
        <h1 className="auth-title">Invalid reset link</h1>
        <p className="auth-subtitle">
          This link is missing its token. Request a new one to reset your password.
        </p>
        <div className="auth-links">
          <Link href="/forgot-password">Request a new link</Link>
        </div>
      </>
    );
  }

  if (resetPassword.isSuccess) {
    return (
      <>
        <AuthLogo />
        <h1 className="auth-title">Password updated</h1>
        <p className="auth-subtitle">Taking you to your dashboard…</p>
      </>
    );
  }

  const error = mismatch
    ? "Passwords don't match"
    : resetPassword.isError
      ? resetPassword.error instanceof ApiError
        ? resetPassword.error.message
        : 'Could not reset your password'
      : '';

  return (
    <>
      <AuthLogo />
      <h1 className="auth-title">Choose a new password</h1>
      <p className="auth-subtitle">Make it at least 8 characters.</p>

      <div className={cn('auth-error', error && 'visible')} role="alert">
        {error}
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <PasswordField
          label="New password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          disabled={resetPassword.isPending}
          value={password}
          onChange={setPassword}
        />
        <PasswordField
          label="Confirm password"
          placeholder="Type it again"
          autoComplete="new-password"
          minLength={8}
          disabled={resetPassword.isPending}
          value={confirm}
          onChange={setConfirm}
        />

        <SubmitButton label="Reset password" loading={resetPassword.isPending} />

        {resetPassword.isError ? (
          <div className="auth-links">
            <Link href="/forgot-password">Request a new link</Link>
          </div>
        ) : null}
      </form>
    </>
  );
}
