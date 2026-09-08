'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMe, useResendVerification, useVerifyEmail } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AuthLogo } from '../auth-logo';
import { SubmitButton } from '../auth-ui';

export function VerifyEmailClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const me = useMe();
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const consumed = useRef(false);

  // Consume a token from the email link exactly once.
  useEffect(() => {
    if (token && !consumed.current) {
      consumed.current = true;
      verify.mutate({ token });
    }
  }, [token, verify]);

  // Already verified and just visiting the page — move along.
  useEffect(() => {
    if (!token && me.data?.user.isVerified) router.replace('/dashboard');
  }, [token, me.data, router]);

  // Land on the dashboard shortly after a successful verification.
  useEffect(() => {
    if (!verify.isSuccess) return;
    const t = setTimeout(() => router.replace('/dashboard'), 1400);
    return () => clearTimeout(t);
  }, [verify.isSuccess, router]);

  const email = me.data?.user.email;
  const hasSession = Boolean(me.data);

  let title = 'Verify your email';
  let subtitle = email
    ? `We sent a verification link to ${email}. Open your inbox or spam folder to activate your account.`
    : 'Open the verification link we emailed you to activate your account.';
  let body: ReactNode;

  if (token && (verify.isPending || verify.isIdle)) {
    subtitle = 'Confirming your email…';
    body = <p className="verify-note">One moment.</p>;
  } else if (token && verify.isSuccess) {
    title = 'Email verified';
    subtitle = "You're all set.";
    body = <p className="verify-note verify-ok">Taking you to your dashboard…</p>;
  } else if (token && verify.isError) {
    title = 'Verification failed';
    subtitle =
      verify.error instanceof ApiError
        ? verify.error.message
        : 'This link is invalid or has expired.';
    body = <ResendArea hasSession={hasSession} resend={resend} />;
  } else {
    body = <ResendArea hasSession={hasSession} resend={resend} />;
  }

  return (
    <>
      <AuthLogo />
      <h1 className="auth-title">{title}</h1>
      <p className="auth-subtitle">{subtitle}</p>
      {body}
      <div className="auth-links">
        <Link href="/login">Back to sign in</Link>
      </div>
    </>
  );
}

function ResendArea({
  hasSession,
  resend,
}: {
  hasSession: boolean;
  resend: ReturnType<typeof useResendVerification>;
}) {
  if (!hasSession) {
    return (
      <p className="verify-note">
        <Link href="/login">Sign in</Link> to request a new verification email.
      </p>
    );
  }

  return (
    <div className="verify-actions">
      {resend.isSuccess ? (
        <p className="verify-note verify-ok">Sent — check your inbox.</p>
      ) : resend.isError ? (
        <p className={cn('auth-error', 'visible')} role="alert">
          {resend.error instanceof ApiError ? resend.error.message : 'Could not resend the email'}
        </p>
      ) : null}
      <SubmitButton
        type="button"
        label={resend.isSuccess ? 'Resend again' : 'Resend verification email'}
        loading={resend.isPending}
        onClick={() => resend.mutate()}
      />
    </div>
  );
}
