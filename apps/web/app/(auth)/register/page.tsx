import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create a free SMSGecko account to start buying virtual numbers for OTP and SMS verification.',
  alternates: { canonical: '/register' },
};

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
