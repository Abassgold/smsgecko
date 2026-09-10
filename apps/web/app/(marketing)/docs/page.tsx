'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Container } from '@/components/ui/container';
import { CodeBlock } from '@/components/ui/code-block';
import { cn } from '@/lib/cn';

const BASE = 'https://api.smsgecko.com';

/* ------------------------------------------------------------------ nav */

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: 'Getting started',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'auth', label: 'Authentication' },
      { id: 'base-url', label: 'Base URL' },
      { id: 'idempotency', label: 'Idempotency' },
      { id: 'errors', label: 'Errors' },
      { id: 'rate-limits', label: 'Rate limits' },
    ],
  },
  {
    group: 'Lifecycle',
    items: [{ id: 'lifecycle', label: 'The OTP lifecycle' }],
  },
  {
    group: 'Catalog',
    items: [{ id: 'list-products', label: 'GET /catalog/products' }],
  },
  {
    group: 'Orders',
    items: [
      { id: 'create-order', label: 'POST /orders' },
      { id: 'active-orders', label: 'GET /orders/active' },
      { id: 'get-order', label: 'GET /orders/:id' },
      { id: 'finish-order', label: 'POST /orders/:id/finish' },
      { id: 'cancel-order', label: 'POST /orders/:id/cancel' },
      { id: 'resend-order', label: 'POST /orders/:id/resend' },
      { id: 'reactivate-order', label: 'POST /orders/:id/reactivate' },
    ],
  },
  {
    group: 'Reference',
    items: [
      { id: 'order-object', label: 'The order object' },
      { id: 'product-object', label: 'The product object' },
    ],
  },
];

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

function Sidebar() {
  const ids = NAV.flatMap((g) => g.items.map((i) => i.id));
  const active = useActiveSection(ids);
  return (
    <nav className="flex flex-col gap-6 text-sm">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
            {g.group}
          </div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  className={cn(
                    'block rounded-md px-2 py-1 font-mono text-[12.5px] transition-colors',
                    active === i.id
                      ? 'bg-accent-soft text-accent'
                      : 'text-muted hover:text-text',
                  )}
                >
                  {i.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------------- pieces */

const METHOD_TONE: Record<string, string> = {
  GET: 'border-success/30 bg-success/10 text-success',
  POST: 'border-accent/30 bg-accent-soft text-accent',
  DELETE: 'border-danger/30 bg-danger/10 text-danger',
};

function Method({ children }: { children: string }) {
  return (
    <span
      className={cn(
        'rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold',
        METHOD_TONE[children] ?? 'border-border bg-surface-2 text-muted',
      )}
    >
      {children}
    </span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-10 first:border-0 first:pt-0">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 text-[15px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
      <Method>{method}</Method>
      <span className="font-mono text-[13px] text-text">{path}</span>
    </div>
  );
}

function Params({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-widest text-faint">
            <th className="px-4 py-2.5 font-medium">Field</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, type, note]) => (
            <tr key={name} className="border-b border-border last:border-0 align-top">
              <td className="px-4 py-2.5 font-mono text-[12.5px] text-text">{name}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-faint">{type}</td>
              <td className="px-4 py-2.5 text-muted">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const curl = (label: string, code: string) => ({ label, language: 'bash', code });
const js = (code: string) => ({ label: 'JavaScript', language: 'javascript', code });

/* ------------------------------------------------------------------ page */

export default function DocsPage() {
  return (
    <Container size="wide" className="py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">API</span> Reference
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          A REST API over HTTPS with JSON bodies and Bearer authentication. Buy a virtual number
          for an exact price tier, poll it for the verification code, then finish. Everything the
          dashboard does is available here.
        </p>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Sidebar />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-10">
          <Section id="overview" title="Overview">
            <p>
              The API is versioned under <code>/api/v2</code>. Responses are JSON. Money is a
              decimal USD string with variable precision (<code>&quot;0.5&quot;</code>,{' '}
              <code>&quot;0.425&quot;</code>) — parse it, don&apos;t assume two places. Timestamps
              are ISO 8601 UTC.
            </p>
            <p>
              Typical integration: list <a href="#list-products" className="text-accent">products</a>{' '}
              for a service, <a href="#create-order" className="text-accent">create an order</a>{' '}
              against one, then <a href="#get-order" className="text-accent">poll the order</a>{' '}
              until <code>otp_code</code> is set.
            </p>
          </Section>

          <Section id="auth" title="Authentication">
            <p>
              Every request needs a Bearer token. Mint one from the dashboard (Settings → API
              keys) or via <code>POST /api/v1/api-keys</code> with a session cookie. Keys look
              like <code>smsg_live_…</code> and are shown once.
            </p>
            <CodeBlock
              title="Header"
              tabs={[curl('cURL', `curl ${BASE}/api/v2/orders/active \\\n  -H "Authorization: Bearer smsg_live_xxxxxxxxxxxx"`)]}
            />
            <p className="text-sm text-faint">
              A missing or invalid key returns <code>401 unauthorized</code>. A valid key for a
              suspended account returns <code>403 forbidden</code>.
            </p>
          </Section>

          <Section id="base-url" title="Base URL">
            <Params
              rows={[
                ['Production', 'string', `${BASE}/api/v2`],
                ['Local dev', 'string', 'http://localhost:4000/api/v2'],
              ]}
            />
          </Section>

          <Section id="idempotency" title="Idempotency">
            <p>
              <code>POST /orders</code> is retry-safe. Send an <code>Idempotency-Key</code> header
              (8–128 chars) — replaying it returns the original order instead of buying twice.
              Reuse the same key across every retry of one logical purchase.
            </p>
          </Section>

          <Section id="errors" title="Errors">
            <p>
              Failures use HTTP status codes and a consistent body:{' '}
              <code>{'{ "error": { "code": string, "message": string, "details"?: unknown } }'}</code>.
            </p>
            <Params
              rows={[
                ['400 bad_request', 'error', 'Malformed body / query. `details` carries the field messages.'],
                ['400 invalid_json', 'error', 'Request body is not valid JSON.'],
                ['400 invalid id', 'error', 'The `:id` in the path is not a 24-hex order id.'],
                ['401 unauthorized', 'error', 'Missing or invalid Bearer token.'],
                ['402 insufficient_balance', 'error', 'Wallet balance is below the order price.'],
                ['403 forbidden', 'error', 'API key belongs to a suspended account.'],
                ['404 not_found', 'error', 'No order with that id under your account.'],
                ['409 conflict', 'error', 'No stock, order already resolved, provider can’t resend/reactivate, …'],
                ['422 unprocessable', 'error', 'Price moved above `max_price`, or the tier is gone.'],
                ['429 rate_limited', 'error', 'Too many requests — back off and retry.'],
              ]}
            />
          </Section>

          <Section id="rate-limits" title="Rate limits">
            <p>
              300 requests per minute per IP. Poll a single order no faster than every ~3 seconds;
              the code rarely lands sooner than that.
            </p>
          </Section>

          <Section id="lifecycle" title="The OTP lifecycle">
            <ol className="flex list-decimal flex-col gap-3 pl-5 marker:text-faint">
              <li>
                <b className="text-text">Find a product.</b> <code>GET /catalog/products?service=</code>{' '}
                returns one row per price tier for each country. Each row&apos;s <code>id</code> is a
                stable tier slot.
              </li>
              <li>
                <b className="text-text">Create the order.</b>{' '}
                <code>POST /orders</code> with <code>catalog_product_id</code> and a{' '}
                <code>max_price</code> cap. The wallet is charged now; the order is{' '}
                <code>waiting</code> with a <code>phone_number</code>.
              </li>
              <li>
                <b className="text-text">Poll for the code.</b> <code>GET /orders/:id</code> until{' '}
                <code>status</code> is <code>completed</code> and <code>otp_code</code> is set. If
                nothing arrives before <code>expires_at</code>, the order auto-refunds.
              </li>
              <li>
                <b className="text-text">Finish</b> (<code>POST /orders/:id/finish</code>) to signal
                you&apos;re done. Or <b className="text-text">cancel</b> a still-waiting order for a
                full refund, <b className="text-text">resend</b> to ask for another SMS, or{' '}
                <b className="text-text">reactivate</b> a completed order to buy another code on the
                same number.
              </li>
            </ol>
            <CodeBlock
              title="End to end"
              tabs={[
                curl(
                  'cURL',
                  `TOKEN="smsg_live_xxxxxxxxxxxx"

# 1. a WhatsApp product in the US
PID=$(curl -s "${BASE}/api/v2/catalog/products?service=wa&country=us" \\
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

# 2. buy it, capped at $0.50
ORDER=$(curl -s -X POST ${BASE}/api/v2/orders \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d "{\\"catalog_product_id\\":\\"$PID\\",\\"max_price\\":\\"0.50\\"}")
ID=$(echo "$ORDER" | jq -r '.id')

# 3. poll until otp_code is present
until curl -s ${BASE}/api/v2/orders/$ID \\
  -H "Authorization: Bearer $TOKEN" | jq -e '.otp_code' >/dev/null; do sleep 3; done

# 4. finish
curl -s -X POST ${BASE}/api/v2/orders/$ID/finish -H "Authorization: Bearer $TOKEN"`,
                ),
                js(`const TOKEN = 'smsg_live_xxxxxxxxxxxx';
const h = { Authorization: \`Bearer \${TOKEN}\`, 'Content-Type': 'application/json' };
const api = (p, init) => fetch(\`${BASE}/api/v2\${p}\`, { ...init, headers: h }).then((r) => r.json());

const { data } = await api('/catalog/products?service=wa&country=us');
const { id } = await api('/orders', {
  method: 'POST',
  headers: { ...h, 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ catalog_product_id: data[0].id, max_price: '0.50' }),
});

let order;
do {
  await new Promise((r) => setTimeout(r, 3000));
  order = await api(\`/orders/\${id}\`);
} while (!order.otp_code);

console.log('code:', order.otp_code);
await api(\`/orders/\${id}/finish\`, { method: 'POST' });`),
              ]}
            />
          </Section>

          <Section id="list-products" title="List products">
            <Endpoint method="GET" path="/api/v2/catalog/products" />
            <p>
              One product per price tier of a service×country, cheapest first — pass a row&apos;s{' '}
              <code>id</code> to <a href="#create-order" className="text-accent">POST /orders</a>.
              Without <code>service</code> you instead get a bare service list for discovery
              (<code>price</code> <code>&quot;0&quot;</code>, <code>stock 0</code>, <code>id</code>{' '}
              is just the service code — <b>not orderable</b>). Query with <code>?service=</code> to
              get real, buyable rows.
            </p>
            <Params
              rows={[
                ['service', 'string?', 'Provider service code (e.g. "wa"). Required for prices.'],
                ['country', 'string?', 'Provider country code — narrows the results.'],
                ['limit', 'int?', '1–500, default 200.'],
              ]}
            />
            <CodeBlock
              title="Response"
              tabs={[
                curl(
                  'JSON',
                  `{
  "data": [
    {
      "id": "wa::us::0",
      "service": "wa",
      "service_slug": "wa",
      "country": "United States",
      "country_code": "us",
      "operator": null,
      "price": "0.47",
      "stock": 212412
    }
  ]
}`,
                ),
              ]}
            />
          </Section>

          <Section id="create-order" title="Create an order">
            <Endpoint method="POST" path="/api/v2/orders" />
            <p>
              Buys the chosen tier, charges the wallet, rents a number. Returns{' '}
              <code>201</code> with a <code>waiting</code> order.
            </p>
            <Params
              rows={[
                ['catalog_product_id', 'string', 'A product `id` from /catalog/products. (`product_id` is accepted too.)'],
                ['max_price', 'string?', 'Decimal USD cap — 422 if the live price exceeds it.'],
                ['operator_id', 'string?', 'Pin a carrier: buys the cheapest in-stock tier for it, overriding any tier index in `catalog_product_id`.'],
                ['Idempotency-Key', 'header?', '8–128 chars — replay-safe create.'],
              ]}
            />
            <CodeBlock
              title="Request"
              tabs={[
                curl(
                  'cURL',
                  `curl -X POST ${BASE}/api/v2/orders \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Idempotency-Key: 7b1e0c9c-3d21-4b2f-9a10-8f4e2c1d0abc" \\
  -H "Content-Type: application/json" \\
  -d '{"catalog_product_id":"wa::us::0","max_price":"0.50"}'`,
                ),
                curl(
                  'Response',
                  `{
  "id": "665f2a1b9c4d8e0012ab34cd",
  "status": "waiting",
  "product": { "service": "Whatsapp", "country": "United States" },
  "phone_number": "+15551234567",
  "price": "0.47",
  "otp_code": null,
  "sms": [],
  "created_at": "2026-09-10T14:00:00.000Z",
  "expires_at": "2026-09-10T14:20:00.000Z",
  "finished_at": null
}`,
                ),
              ]}
            />
          </Section>

          <Section id="active-orders" title="Active orders">
            <Endpoint method="GET" path="/api/v2/orders/active" />
            <p>
              Every still-<code>waiting</code> order on your account, newest first:{' '}
              <code>{'{ "data": Order[] }'}</code>.
            </p>
          </Section>

          <Section id="get-order" title="Get an order">
            <Endpoint method="GET" path="/api/v2/orders/:id" />
            <p>
              Poll this for the code. <code>sms[]</code> holds each received message;{' '}
              <code>otp_code</code> is the parsed code once it lands.
            </p>
          </Section>

          <Section id="finish-order" title="Finish an order">
            <Endpoint method="POST" path="/api/v2/orders/:id/finish" />
            <p>
              Marks a <code>completed</code> order finished (<code>finished_at</code> is set) and
              tells the upstream you&apos;re done with the number. No-op if already finished.
            </p>
          </Section>

          <Section id="cancel-order" title="Cancel an order">
            <Endpoint method="POST" path="/api/v2/orders/:id/cancel" />
            <p>
              Cancels a <code>waiting</code> order and refunds it in full. A short post-purchase
              lock applies — <code>409</code> until it elapses, and once a code has arrived.
            </p>
          </Section>

          <Section id="resend-order" title="Resend a code">
            <Endpoint method="POST" path="/api/v2/orders/:id/resend" />
            <p>
              Asks the upstream for another SMS on a still-<code>waiting</code> order. Free — no
              new rental, no charge. <code>409</code> if the order isn&apos;t waiting or the
              provider can&apos;t resend.
            </p>
          </Section>

          <Section id="reactivate-order" title="Reactivate an order">
            <Endpoint method="POST" path="/api/v2/orders/:id/reactivate" />
            <p>
              Buys another code on a <code>completed</code> order&apos;s number. Charges the
              current tier price and reopens the order as <code>waiting</code>, keeping its
              message history. <code>402</code> on low balance; <code>409</code> if the order
              isn&apos;t completed or the provider can&apos;t reactivate.
            </p>
          </Section>

          <Section id="order-object" title="The order object">
            <Params
              rows={[
                ['id', 'string', '24-hex order id.'],
                ['status', 'enum', '"waiting" | "completed" | "canceled" | "expired"'],
                ['product', 'object', '{ service, country } — display names.'],
                ['phone_number', 'string', 'E.164, e.g. "+15551234567".'],
                ['price', 'string', 'Decimal USD charged.'],
                ['otp_code', 'string | null', 'Parsed code once delivered.'],
                ['sms', 'array', '[{ sender, text, received_at }]'],
                ['created_at', 'string', 'ISO 8601.'],
                ['expires_at', 'string', 'Auto-refund deadline while waiting.'],
                ['finished_at', 'string | null', 'Set by /finish.'],
              ]}
            />
          </Section>

          <Section id="product-object" title="The product object">
            <Params
              rows={[
                ['id', 'string', '"<service>::<country>[::<tier>]" — pass to /orders.'],
                ['service', 'string', 'Provider service code.'],
                ['service_slug', 'string', 'Same code (kept for compatibility).'],
                ['country', 'string', 'Display name.'],
                ['country_code', 'string', 'Provider country code.'],
                ['operator', 'string | null', 'Upstream operator, when distinguished.'],
                ['price', 'string', 'Decimal USD, markup applied. Variable precision — "0.5", "0.425".'],
                ['stock', 'number', 'Reported availability (0 = unknown / none).'],
              ]}
            />
          </Section>
        </div>
      </div>
    </Container>
  );
}
