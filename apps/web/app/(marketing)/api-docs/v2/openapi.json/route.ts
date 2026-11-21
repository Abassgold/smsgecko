import { V2_GROUPS, V2_METHODS, WEBHOOK_PAYLOAD, type V2Method, type V2Param } from '@/lib/api-v2-methods';

/** OpenAPI 3 description of the REST API v2, built from the same list as the docs page. Always uses a placeholder key. */
const asJson = (text: string) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const openApiPath = (path: string) => path.replace(/:id\b/g, '{id}');

function parameter(p: V2Param) {
  return { name: p.name, in: p.in, required: p.in === 'path' ? true : p.required, description: p.desc, schema: { type: 'string' }, ...(p.example ? { example: p.example } : {}) };
}

function operation(m: V2Method, suffix = '') {
  const bodyParams = m.params.filter((p) => p.in === 'body');
  return {
    tags: [m.group],
    summary: m.title,
    operationId: `${m.id}${suffix}`,
    description: [m.desc, ...(m.notes ?? [])].join('\n\n'),
    parameters: m.params.filter((p) => p.in !== 'body').map(parameter),
    ...(bodyParams.length
      ? {
          requestBody: {
            required: bodyParams.some((p) => p.required),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: bodyParams.filter((p) => p.required).map((p) => p.name),
                  properties: Object.fromEntries(bodyParams.map((p) => [p.name, { type: p.name === 'quantity' ? 'integer' : p.name === 'regenerate_secret' ? 'boolean' : 'string', description: p.desc, ...(p.example ? { example: p.example } : {}) }])),
                },
                ...(m.sampleBody ? { example: m.sampleBody } : {}),
              },
            },
          },
        }
      : suffix
        ? { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { type: 'string', example: 'SG-4F2K-9X' } } } } } } }
        : {}),
    responses: Object.fromEntries(
      [...new Set(m.responses.map((r) => r.status))].map((status) => {
        const rows = m.responses.filter((r) => r.status === status);
        return [
          String(status),
          {
            description: rows.map((r) => `${r.label}: ${r.desc}`).join(' '),
            content: { 'application/json': { examples: Object.fromEntries(rows.map((r) => [r.label, { value: asJson(r.body) }])) } },
          },
        ];
      }),
    ),
    security: [{ bearerAuth: [] }],
  };
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const paths: Record<string, Record<string, unknown>> = {};
  for (const m of V2_METHODS) {
    (paths[openApiPath(m.path)] ??= {})[m.method.toLowerCase()] = operation(m);
    for (const a of m.alsoAt ?? []) {
      // The body-style twin of an `:id` address takes the id in the body instead of the path.
      const twin = { ...m, params: m.params.filter((p) => p.name !== 'id') };
      (paths[openApiPath(a.path)] ??= {})[a.method.toLowerCase()] = operation(a.path === '/orders/create' ? m : twin, a.path === '/orders/create' ? 'Alias' : 'ByBody');
    }
  }

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'SMSGecko REST API v2',
      version: '2.0.0',
      description:
        'Buy a virtual number, read its OTP code and get refunded when none arrives. JSON in and out, Bearer key, idempotent purchases. Prices are US dollars as plain strings. Every answer is `{ "success": true, "data": … }` or `{ "success": false, "error": { "code", "message" } }`.\n\nWebhook deliveries (order.otp_received) look like this, signed with `X-SMSGecko-Signature: sha256=<hmac of the raw body>`:\n\n```json\n' + WEBHOOK_PAYLOAD + '\n```',
    },
    servers: [{ url: `${origin}/api/v2` }],
    tags: V2_GROUPS.map((name) => ({ name })),
    paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Your API key, like smsg_live_xxxxxxxxxxxx (Settings → API keys).' } } },
  };
  return Response.json(spec, { headers: { 'cache-control': 'public, max-age=300' } });
}
