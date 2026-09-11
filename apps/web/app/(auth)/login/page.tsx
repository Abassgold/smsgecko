import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Welcome back',
  description: 'Log in to your SMSGecko dashboard to buy numbers and manage your account.',
  alternates: { canonical: '/login' },
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
