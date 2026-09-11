import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'API Reference',
  description:
    'The SMSGecko v2 REST API — buy virtual numbers and receive OTP codes programmatically.',
  alternates: { canonical: '/docs' },
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return children;
}
