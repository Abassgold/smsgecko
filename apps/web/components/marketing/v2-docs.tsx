'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Container } from '@/components/ui/container';
import { CodeBlock, CodeLabel } from '@/components/ui/code-block';
import { cn } from '@/lib/cn';
import { V2_QUICK_START } from '@/components/marketing/content';
import {
  ERROR_ROWS,
  ORDER_STATUS_ROWS,
  V2_GROUPS,
  V2_METHODS,
  WEBHOOK_EVENTS,
  WEBHOOK_PAYLOAD,
  WEBHOOK_VERIFY_NODE,
  type V2Method,
  type V2Response,
} from '@/lib/api-v2-methods';

const BASE = 'https://www.smsgecko.com';
const API = `${BASE}/api/v2`;

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: 'Getting started',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'quick-start', label: 'Quick start' },
      { id: 'base-url', label: 'Base URL' },
      { id: 'authentication', label: 'Authentication' },
      { id: 'responses', label: 'Responses and errors' },
      { id: 'idempotency', label: 'Idempotency' },
      { id: 'rate-limits', label: 'Rate limits and polling' },
      { id: 'lifecycle', label: 'The order lifecycle' },
    ],
  },
  ...V2_GROUPS.map((g) => ({
    group: g,
    items: [
      ...V2_METHODS.filter((m) => m.group === g).map((m) => ({ id: m.id, label: m.title })),
      ...(g === 'Webhook' ? [{ id: 'webhook-events', label: 'Webhook events' }] : []),
    ],
  })),
];

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
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
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-faint">{g.group}</div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  className={cn('block rounded-md px-2 py-1 text-[12.5px] transition-colors', active === i.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text')}
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
  PATCH: 'border-warning/30 bg-warning/10 text-warning',
};

function Method({ children }: { children: string }) {
  return <span className={cn('rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold', METHOD_TONE[children] ?? 'border-border bg-surface-2 text-muted')}>{children}</span>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-10 first:border-0 first:pt-0">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 text-[15px] leading-relaxed text-muted">{children}</div>
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

/** N-column reference table: the first column is a mono name, the last is prose, anything between is small mono. */
function Table({ rows, headers }: { rows: string[][]; headers: string[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-widest text-faint">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cols, i) => (
            <tr key={`${cols[0]}-${i}`} className="border-b border-border last:border-0 align-top">
              {cols.map((cell, j) => (
                <td
                  key={j}
                  className={j === 0 ? 'px-4 py-2.5 font-mono text-[12.5px] text-text' : j === cols.length - 1 ? 'px-4 py-2.5 text-muted' : 'px-4 py-2.5 font-mono text-[12px] text-faint'}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_TEXT: Record<number, string> = {
  200: '200 OK',
  201: '201 Created',
  400: '400 Bad Request',
  401: '401 Unauthorized',
  402: '402 Payment Required',
  403: '403 Forbidden',
  404: '404 Not Found',
  409: '409 Conflict',
  422: '422 Unprocessable',
  429: '429 Too Many Requests',
  503: '503 Service Unavailable',
};

function ResponseBlock({ r }: { r: V2Response }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm">
        <b className="text-text">{r.label}</b> — {r.desc}
      </p>
      <CodeBlock status={STATUS_TEXT[r.status] ?? String(r.status)} tabs={[{ label: 'JSON', language: 'json', code: r.body }]} />
    </div>
  );
}

/** The example request for one method, in curl. Built from the same data as the tables, so they cannot disagree. */
function curlFor(m: V2Method): string {
  const query = m.params.filter((p) => p.in === 'query' && p.example).slice(0, 2).map((p) => `${p.name}=${p.example}`).join('&');
  const url = `${API}${m.path.replace(':id', '$ORDER_ID')}${query ? `?${query}` : ''}`;
  const lines = [`curl ${m.method === 'GET' ? '' : `-X ${m.method} `}${url.includes('?') ? `"${url}"` : url}`, '  -H "Authorization: Bearer $SMSGECKO_TOKEN"'];
  if (m.params.some((p) => p.name === 'Idempotency-Key')) lines.push('  -H "Idempotency-Key: $(uuidgen)"');
  if (m.sampleBody) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  -d '${JSON.stringify(m.sampleBody)}'`);
  }
  return lines.join(' \\\n');
}

function MethodSection({ m }: { m: V2Method }) {
  return (
    <Section id={m.id} title={m.title}>
      <Endpoint method={m.method} path={`/api/v2${m.path}`} />
      {m.alsoAt?.map((a) => (
        <p key={a.path} className="text-sm text-faint">
          Also at <code>{a.method} /api/v2{a.path}</code>. {a.note}
        </p>
      ))}
      <p>{m.desc}</p>
      {m.notes && (
        <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-faint">
          {m.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {m.params.length > 0 && (
        <Table
          headers={['Parameter', 'In', 'Required', 'Notes']}
          rows={m.params.map((p) => [p.name, p.in, p.required ? 'yes' : 'no', p.desc])}
        />
      )}
      <CodeLabel>Example request</CodeLabel>
      <CodeBlock tabs={[{ label: 'cURL', language: 'bash', code: curlFor(m) }]} />
      <CodeLabel>Responses</CodeLabel>
      <div className="flex flex-col gap-4">
        {m.responses.map((r) => (
          <ResponseBlock key={`${r.status}-${r.label}`} r={r} />
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ page */

export function V2Docs() {
  return (
    <Container size="wide" className="py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">REST API</span> v2
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          The JSON API for buying a number, waiting for its code and getting refunded when none comes. Plain HTTP: a Bearer key, JSON in and out, and
          idempotent purchases.
        </p>
        <p className="mt-3 text-sm text-faint">
          <a href="/api-docs/v2/openapi.json" className="text-accent">OpenAPI spec</a> ·{' '}
          <a href="/api-docs/v2/postman.json" download className="text-accent">Postman collection</a> ·{' '}
          Using SMS-Activate software? See the <a href="/docs" className="text-accent">SMS-Activate protocol docs</a>.
        </p>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
            <Sidebar />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-10">
          <Section id="overview" title="Overview">
            <p>
              Every call goes to <code>{API}</code> with your key as a Bearer token and answers JSON. Prices are in US dollars, written as plain strings like{' '}
              <code>&quot;0.5&quot;</code>, so you never lose a digit to floating point.
            </p>
            <p>
              A typical integration: <a href="#listProducts" className="text-accent">list products</a> to find what to buy,{' '}
              <a href="#createOrder" className="text-accent">create an order</a>, <a href="#getOrder" className="text-accent">poll it</a> until the code arrives,
              then <a href="#finishOrder" className="text-accent">finish</a> it. If no code comes, the order expires and you are refunded automatically.
            </p>
          </Section>

          <Section id="quick-start" title="Quick start">
            <p>
              The same four steps in cURL, JavaScript and Python, all plain HTTP. Set <code>SMSGECKO_TOKEN</code> to your key first. In the cURL tab, copy a
              product <code>id</code> from step 1 into step 2 and the order <code>id</code> from step 2 into <code>$ORDER_ID</code>; the other two tabs do
              that for you.
            </p>
            <CodeBlock tabs={V2_QUICK_START} title="Buy a number and read its code" />
          </Section>

          <Section id="base-url" title="Base URL">
            <Table headers={['Name', 'Notes']} rows={[['Production', API]]} />
          </Section>

          <Section id="authentication" title="Authentication">
            <p>
              Send your key in the <code>Authorization</code> header. Create it in the dashboard under Settings → API keys. It looks like{' '}
              <code>smsg_live_…</code> and is shown only once, so copy it somewhere safe. Keep it on your server: never put it in a browser or a mobile app.
            </p>
            <p>
              An account has one active key. Creating a new one revokes the old one. The same key also works on the{' '}
              <a href="/docs" className="text-accent">SMS-Activate protocol</a>.
            </p>
            <CodeBlock title="Request" tabs={[{ label: 'cURL', language: 'bash', code: `curl ${API}/balance \\\n  -H "Authorization: Bearer smsg_live_xxxxxxxxxxxx"` }]} />
            <p className="text-sm text-faint">A missing, wrong or revoked key answers 401 <code>UNAUTHORIZED</code>. A suspended account answers 403 <code>FORBIDDEN</code>.</p>
          </Section>

          <Section id="responses" title="Responses and errors">
            <p>
              Every answer is JSON. Success is <code>{'{ "success": true, "data": … }'}</code>. A failure is{' '}
              <code>{'{ "success": false, "error": { "code", "message" } }'}</code> with a matching HTTP status. Match on <code>error.code</code>, not on the message
              text, which can be reworded.
            </p>
            <Table headers={['Code', 'HTTP', 'Meaning']} rows={ERROR_ROWS} />
          </Section>

          <Section id="idempotency" title="Idempotency">
            <p>
              Buying a number costs money, so a timed-out request is risky to repeat. Send an <code>Idempotency-Key</code> header (8 to 128 characters, a fresh
              UUID per purchase) on create. If you do not know whether a call worked, send it again with the <b className="text-text">same key</b>: you get the
              original order back and are charged once.
            </p>
            <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-faint">
              <li>Same key, same body: the original order, no second charge.</li>
              <li>Same key, different body: 422 <code>IDEMPOTENCY_KEY_REUSED</code>.</li>
              <li>Same key while the first call is still running: 409 <code>REQUEST_IN_PROGRESS</code>. Wait a moment and send it again.</li>
            </ul>
          </Section>

          <Section id="rate-limits" title="Rate limits and polling">
            <p>
              300 requests per minute per IP, across the whole API. Over that, you get 429 <code>RATE_LIMITED</code> until the minute resets.
            </p>
            <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-faint">
              <li><b className="text-text">Poll every 5 seconds.</b> A code rarely arrives sooner, so faster polling only spends your request budget.</li>
              <li><b className="text-text">Count your parallel orders.</b> 20 orders polled every 5 seconds is 240 requests a minute.</li>
              <li><b className="text-text">Stop when it ends.</b> Only <code>waiting</code> needs more polling.</li>
              <li><b className="text-text">Prefer a webhook</b> when you can: it tells you the moment a code arrives. See <a href="#webhook-events" className="text-accent">Webhook events</a>.</li>
            </ul>
          </Section>

          <Section id="lifecycle" title="The order lifecycle">
            <Table headers={['status', 'Meaning']} rows={ORDER_STATUS_ROWS} />
            <ol className="flex list-decimal flex-col gap-2 pl-5 marker:text-faint">
              <li><b className="text-text">Create</b> charges your balance and returns the number.</li>
              <li>Enter the number on the service, then <b className="text-text">poll</b> the order until <code>otp_code</code> is set.</li>
              <li><b className="text-text">Finish</b> it when you have used the code.</li>
              <li>No SMS? <b className="text-text">Cancel</b> for a full refund (after the short lock-in), or let it expire and it is refunded automatically.</li>
            </ol>
          </Section>

          {V2_GROUPS.map((g) => (
            <div key={g} className="flex flex-col gap-10">
              {V2_METHODS.filter((m) => m.group === g).map((m) => (
                <MethodSection key={m.id} m={m} />
              ))}
              {g === 'Webhook' && (
                <Section id="webhook-events" title="Webhook events">
                  <p>
                    With a webhook set, we send a <code>POST</code> with a JSON body to your address when something happens. Today these events are sent:
                  </p>
                  <Table headers={['Event', 'When']} rows={WEBHOOK_EVENTS} />
                  <CodeLabel>Delivery body</CodeLabel>
                  <CodeBlock tabs={[{ label: 'JSON', language: 'json', code: WEBHOOK_PAYLOAD }]} />
                  <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-faint">
                    <li>Answer with a 2xx (any code from 200 to 299) within 5 seconds. Anything else, including a redirect, a 4xx, a 5xx, a timeout or no answer, counts as not delivered.</li>
                    <li>An undelivered event is retried 5 more times, after 10 seconds, 1 minute, 5 minutes, 30 minutes and 2 hours, then dropped. Retries stop as soon as you answer 2xx. If you are down longer than that, poll <code>GET /orders/:id</code> to catch up.</li>
                    <li>Every attempt for one event sends the same body and signature. The <code>X-SMSGecko-Delivery</code> header is the same id each time and <code>X-SMSGecko-Attempt</code> counts 1 to 6, so you can ignore a duplicate.</li>
                    <li>Only orders you create through the API send webhooks. Purchases made on the website do not.</li>
                    <li>Your address must be https and public.</li>
                  </ul>
                  <h3 className="font-display text-base font-semibold text-text">Verify the signature</h3>
                  <p>
                    Every delivery carries <code>X-SMSGecko-Signature: sha256=&lt;hex&gt;</code>, the HMAC-SHA256 of the raw body with your webhook secret. Check it
                    before you trust a delivery.
                  </p>
                  <CodeBlock tabs={[{ label: 'Node', language: 'ts', code: WEBHOOK_VERIFY_NODE }]} />
                </Section>
              )}
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
