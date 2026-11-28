import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'SMS Verification API Docs: getNumber, getStatus, Webhooks',
  description:
    'SMS activation API reference: every handler_api.php method (getNumber, getStatus, setStatus, getPrices) with examples, plus the REST API and HMAC-signed webhooks.',
  alternates: { canonical: '/docs' },
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return children;
}
