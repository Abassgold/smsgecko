'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Container } from '@/components/ui/container';
import { CodeBlock, CodeLabel } from '@/components/ui/code-block';
import { cn } from '@/lib/cn';
import { GROUPS, METHODS, type ApiMethod, type ApiResponse } from '@/lib/api-methods';

// The web host proxies /stubs/* to the API (api.smsgecko.com is not used for this).
const BASE = 'https://www.smsgecko.com';
const ENDPOINT = `${BASE}/stubs/handler_api.php`;


const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: 'Getting started',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'base-url', label: 'Base URL' },
      { id: 'authentication', label: 'Authentication' },
      { id: 'errors', label: 'Errors' },
      { id: 'rate-limits', label: 'Rate limits' },
      { id: 'lifecycle', label: 'The OTP lifecycle' },
    ],
  },
  ...GROUPS.map((g) => ({
    group: g,
    items: METHODS.filter((m) => m.group === g).map((m) => ({ id: m.name, label: m.name })),
  })),
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

/** N-column reference table. First column renders as a mono "name" cell, the
 * last as prose notes; anything in between is small mono (e.g. a `type`
 * column) — so both the 3-column `Field/Type/Notes` tables and 2-column
 * `Event/Trigger` tables share one component. */
function Params({
  rows,
  headers = ['Field', 'Type', 'Notes'],
}: {
  rows: string[][];
  headers?: string[];
}) {
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
            <tr key={cols[0] ?? i} className="border-b border-border last:border-0 align-top">
              {cols.map((cell, j) => (
                <td
                  key={j}
                  className={
                    j === 0
                      ? 'px-4 py-2.5 font-mono text-[12.5px] text-text'
                      : j === cols.length - 1
                        ? 'px-4 py-2.5 text-muted'
                        : 'px-4 py-2.5 font-mono text-[12px] text-faint'
                  }
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

const curl = (label: string, code: string) => ({ label, language: 'bash', code });

/* ------------------------------------------------------------------ page */

const STATUS_TEXT: Record<number, string> = {
  200: '200 OK',
  400: '400 Bad Request',
  401: '401 Unauthorized',
  429: '429 Too Many Requests',
  503: '503 Service Unavailable',
};

const requestUrl = (m: ApiMethod) =>
  `${ENDPOINT}?action=${m.name}${m.params.filter((p) => p.required).map((p) => `&${p.name}=${p.example ?? ''}`).join('')}&api_key=YOUR_API_KEY`;

function ResponseBlock({ r }: { r: ApiResponse }) {
  const isJson = r.body.startsWith('{') || r.body.startsWith('[');
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm">
        <b className="text-text">{r.label}</b> — {r.desc}
      </p>
      <CodeBlock
        status={STATUS_TEXT[r.status] ?? String(r.status)}
        tabs={[{ label: isJson ? 'JSON' : 'Text', language: isJson ? 'json' : 'text', code: r.body }]}
      />
    </div>
  );
}

function MethodSection({ m }: { m: ApiMethod }) {
  return (
    <Section id={m.name} title={m.name}>
      <Endpoint method="GET" path={`/stubs/handler_api.php?action=${m.name}`} />
      <p>{m.desc}</p>
      {m.notes && (
        <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-faint">
          {m.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      {m.params.length > 0 && (
        <Params
          headers={['Parameter', 'Required', 'Notes']}
          rows={m.params.map((p) => [p.name, p.required ? 'yes' : 'no', p.desc])}
        />
      )}
      <CodeLabel>Example request</CodeLabel>
      <CodeBlock
        tabs={[
          curl('cURL', `curl "${requestUrl(m)}"`),
          { label: 'URL', language: 'text', code: requestUrl(m) },
        ]}
      />
      <CodeLabel>Responses</CodeLabel>
      <div className="flex flex-col gap-4">
        {m.responses.map((r) => <ResponseBlock key={r.label} r={r} />)}
      </div>
    </Section>
  );
}

export default function DocsPage() {
  return (
    <Container size="wide" className="py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">API</span> Reference
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          SMSGecko speaks the SMS-Activate protocol: one URL, <code>action</code> and{' '}
          <code>api_key</code> in the query string, plain-text answers. Existing SMS-Activate
          software and scripts work by changing only the host.
        </p>
        <p className="mt-3 text-sm text-faint">
          <a href="/api-docs/openapi.json" className="text-accent">OpenAPI spec</a> ·{' '}
          <a href="/api-docs/postman.json" download className="text-accent">Postman collection</a> ·{' '}
          Building something new? See the <a href="/docs/v2" className="text-accent">REST API v2 reference</a>
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
              Every call is a <code>GET</code> (or form <code>POST</code>) to one URL with an{' '}
              <code>action</code>. Most answers are plain-text tokens such as{' '}
              <code>ACCESS_NUMBER:4829371650:15551234567</code>; the V2 and list methods answer
              JSON. Prices are in US dollars.
            </p>
            <p>
              Typical integration: <a href="#getServicesList" className="text-accent">find the service
              code</a> and <a href="#getCountries" className="text-accent">country id</a>,{' '}
              <a href="#getNumber" className="text-accent">buy a number</a>, then{' '}
              <a href="#getStatus" className="text-accent">poll its status</a> until the code arrives.
              Look codes up with those two methods rather than hard-coding them.
            </p>
            <p>
              Already use SMS-Activate software? Pick “SMS-Activate” as the service, set the host to{' '}
              <code>{BASE}</code> and enter your API key. The tool adds{' '}
              <code>/stubs/handler_api.php</code> itself. Methods a tool uses beyond the ones listed
              here are not supported yet.
            </p>
          </Section>

          <Section id="base-url" title="Base URL">
            <Params headers={['Name', 'Notes']} rows={[['Production', ENDPOINT], ['Alias', `${BASE}/api/handler_api`]]} />
          </Section>

          <Section id="authentication" title="Authentication">
            <p>
              Pass your key as <code>api_key</code>. Create one in the dashboard (Settings → API
              keys); keys look like <code>smsg_live_…</code> and are shown only once, so copy it
              somewhere safe.
            </p>
            <CodeBlock
              title="Request"
              tabs={[curl('cURL', `curl "${ENDPOINT}?action=getBalance&api_key=smsg_live_xxxxxxxxxxxx"`)]}
            />
            <p className="text-sm text-faint">
              A missing, wrong or revoked key (or a suspended account) answers <code>BAD_KEY</code>{' '}
              with HTTP 401, before any method runs.
            </p>
          </Section>

          <Section id="errors" title="Errors">
            <p>
              Failures are plain-text tokens, usually with HTTP 200 as the protocol expects — match
              on the token, not the status code. The exceptions are <code>BAD_KEY</code> (401),{' '}
              <code>WRONG_MAX_PRICE</code> (400), a malformed <code>maxPrice</code> (<code>BAD_ACTION</code>, 400), a cancel that could not be confirmed (<code>BAD_ACTION</code>, 503) and <code>RATE_LIMITED</code> (429).
            </p>
            <Params
              headers={['Token', 'Meaning']}
              rows={[
                ['BAD_KEY', 'Missing, wrong or revoked api_key, or a suspended account.'],
                ['BAD_ACTION', 'Unknown action, a malformed maxPrice, or an unexpected server error. With HTTP 503 on setStatus=8: the cancel could not be confirmed, nothing was refunded, try again shortly.'],
                ['BAD_SERVICE / BAD_COUNTRY', 'Unknown service code or country id.'],
                ['NO_NUMBERS', 'Nothing available for that service and country right now.'],
                ['NO_BALANCE', 'Your balance is lower than the price.'],
                ['WRONG_MAX_PRICE:<price>', 'The current price is above your maxPrice. Nothing was bought.'],
                ['RATE_LIMITED', 'Over 300 requests a minute from your IP (HTTP 429). Wait a minute and carry on.'],
                ['NO_ACTIVATION', 'Unknown activation id, or it belongs to another account.'],
                ['BAD_STATUS', 'Unsupported status, or not possible in the activation’s current state (e.g. status 3 before a code arrived).'],
                ['EARLY_CANCEL_DENIED', 'Too soon after purchase to cancel; try again in a couple of minutes.'],
              ]}
            />
          </Section>

          <Section id="rate-limits" title="Rate limits">
            <p>
              300 requests per minute per IP. Once you are over, requests answer{' '}
              <code>RATE_LIMITED</code> (HTTP 429) until the window resets.
            </p>
            <h3 className="mt-2 font-display text-base font-semibold text-text">Polling an activation</h3>
            <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-faint">
              <li><b className="text-text">Poll every 5 seconds.</b> A code rarely arrives sooner, so polling faster only uses your request budget.</li>
              <li><b className="text-text">Count your parallel activations.</b> 20 activations polled every 5 seconds is 240 requests a minute, close to the limit.</li>
              <li><b className="text-text">Stop when it ends.</b> Only <code>STATUS_WAIT_CODE</code> (and <code>STATUS_WAIT_RETRY</code> after you asked for another SMS) needs more polling; <code>STATUS_OK</code> and <code>STATUS_CANCEL</code> are final.</li>
              <li><b className="text-text">Set a time limit.</b> Unanswered numbers are refunded automatically when they expire (<code>getNumberV2</code> returns <code>activationEndTime</code>).</li>
            </ul>
          </Section>

          <Section id="lifecycle" title="The OTP lifecycle">
            <ol className="flex list-decimal flex-col gap-2 pl-5 marker:text-faint">
              <li><code>getNumber</code> charges your balance and returns the activation id and number.</li>
              <li>Enter the number on the service, then poll <code>getStatus</code> every 5 seconds: <code>STATUS_WAIT_CODE</code> until the SMS arrives.</li>
              <li><code>STATUS_OK:&lt;code&gt;</code> — use the code, then <code>setStatus</code> with <code>status=6</code> to finish.</li>
              <li>No SMS? <code>setStatus</code> with <code>status=8</code> cancels for a full refund (after the short lock-in), or let it expire and it is refunded automatically.</li>
            </ol>
          </Section>

          {GROUPS.map((g) => (
            <div key={g} className="flex flex-col gap-10">
              {METHODS.filter((m) => m.group === g).map((m) => <MethodSection key={m.name} m={m} />)}
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
