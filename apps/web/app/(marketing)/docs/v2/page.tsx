import type { Metadata } from 'next';
import { V2Docs } from '@/components/marketing/v2-docs';

export const metadata: Metadata = {
  title: 'REST API v2 Reference',
  description: 'The SMSGecko REST API v2: buy a virtual number, read its OTP code and get refunded when none arrives. JSON, Bearer key, idempotent purchases.',
  alternates: { canonical: '/docs/v2' },
};

export default function Page() {
  return <V2Docs />;
}
