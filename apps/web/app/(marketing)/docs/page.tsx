import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Card } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';

export const metadata: Metadata = { title: 'API Documentation' };

const ENDPOINTS = [
  ['GET', '/api/v2/catalog/products', 'List buyable service×country products with price and stock.'],
  ['POST', '/api/v2/orders', 'Create an order. Body: catalog_product_id, max_price?. Send an Idempotency-Key header.'],
  ['GET', '/api/v2/orders/:id', 'Poll an order for status and the delivered OTP code.'],
  ['POST', '/api/v2/orders/:id/finish', 'Mark a completed order as finished.'],
  ['POST', '/api/v2/orders/:id/cancel', 'Cancel a still-waiting order and refund it.'],
];

export default function DocsPage() {
  return (
    <>
      <Container size="wide" className="pt-16 pb-8 sm:pt-24">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">API</span> Documentation
        </h1>
        <p className="mt-4 max-w-xl text-[15px] text-muted">
          A REST API with Bearer authentication. Create an order for a{' '}
          <code>catalog_product_id</code>, poll for the OTP, then finish the order. Use an{' '}
          <code>Idempotency-Key</code> header to make creates retry-safe.
        </p>
      </Container>

      <Section className="pt-4">
        <Container size="wide">
          <Card className="overflow-hidden">
            <table className="w-full min-w-[640px] text-sm">
              <tbody>
                {ENDPOINTS.map(([method, path, desc]) => (
                  <tr key={path} className="border-b border-border last:border-0">
                    <td className="px-5 py-4 align-top">
                      <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-accent">
                        {method}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top font-mono text-xs">{path}</td>
                    <td className="px-5 py-4 align-top text-muted">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="mt-8">
            <CodeBlock
              title="End-to-end"
              tabs={[
                {
                  label: 'cURL',
                  language: 'bash',
                  code: `# 1. create
curl -X POST $API/api/v2/orders \\
  -H "Authorization: Bearer $SMSGECKO_TOKEN" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"catalog_product_id":"'$ID'","max_price":"0.50"}'

# 2. poll until otp_code is present
curl $API/api/v2/orders/$ORDER_ID -H "Authorization: Bearer $SMSGECKO_TOKEN"

# 3. finish
curl -X POST $API/api/v2/orders/$ORDER_ID/finish -H "Authorization: Bearer $SMSGECKO_TOKEN"`,
                },
              ]}
            />
          </div>
        </Container>
      </Section>
    </>
  );
}
