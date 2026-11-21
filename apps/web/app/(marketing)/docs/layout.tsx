import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'API Reference',
  description:
    'The SMSGecko SMS-Activate-compatible API — buy virtual numbers and receive OTP codes with any SMS-Activate client.',
  alternates: { canonical: '/docs' },
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return children;
}
