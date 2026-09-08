'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRegister } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AuthLogo } from '../auth-logo';
import { PasswordField, SubmitButton } from '../auth-ui';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  // Affiliate links point at `/?ref=CODE`; carry the code through if it lands here.
  const [referralCode, setReferralCode] = useState(() => params.get('ref')?.trim() ?? '');
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
    const code = referralCode.trim();
    register.mutate(
      { email, username: username.trim(), password, ...(code ? { referralCode: code } : {}) },
      { onSuccess: () => router.replace('/dashboard') },
    );
  };

  const error = mismatch
    ? 'Passwords do not match'
    : register.isError
      ? register.error instanceof ApiError
        ? register.error.message
        : 'Sign up failed'
      : '';

  return (
    <>
      <AuthLogo />
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">Join SMSGecko in minutes</p>

      <div className={cn('auth-error', error && 'visible')} role="alert">
        {error}
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            disabled={register.isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="signup-username">Username</label>
          <input
            id="signup-username"
            type="text"
            placeholder="your_handle"
            required
            minLength={3}
            maxLength={15}
            pattern="[a-zA-Z0-9_.\-]+"
            autoComplete="username"
            disabled={register.isPending}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <span className="field-hint">3–15 characters. Letters, numbers, . _ - only.</span>
        </div>

        <div className="field">
          <label htmlFor="signup-ref">Referral code (optional)</label>
          <input
            id="signup-ref"
            type="text"
            placeholder="12-character code"
            minLength={4}
            maxLength={32}
            autoComplete="off"
            disabled={register.isPending}
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
          />
        </div>

        <PasswordField
          label="Password"
          placeholder="Create a password"
          autoComplete="new-password"
          minLength={8}
          disabled={register.isPending}
          value={password}
          onChange={setPassword}
        />

        <PasswordField
          label="Confirm password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          minLength={8}
          disabled={register.isPending}
          value={confirm}
          onChange={setConfirm}
        />

        <SubmitButton label="Create account" loading={register.isPending} />

        <div className="auth-links">
          <Link href="/login">Already have an account?</Link>
        </div>
      </form>
    </>
  );
}
