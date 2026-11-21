import { METHODS } from '@/lib/api-methods';

/** OpenAPI 3 description of the SMS-Activate-compatible API. Always uses a placeholder key. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'SMSGecko SMS-Activate-compatible API',
      version: '1.0.0',
      description:
        'Plain-text SMS-Activate-style API. Every call is GET or POST to one URL with `action` and `api_key`. A missing or wrong key returns `BAD_KEY` (HTTP 401).\n\n' +
        METHODS.map((m) => `**${m.name}** — ${m.desc}`).join('\n\n'),
    },
    servers: [{ url: origin }],
    paths: {
      '/stubs/handler_api.php': {
        get: {
          summary: 'Call an API method',
          operationId: 'handler',
          parameters: [
            { name: 'action', in: 'query', required: true, schema: { type: 'string', enum: METHODS.map((m) => m.name) } },
            { name: 'api_key', in: 'query', required: true, schema: { type: 'string' }, example: 'YOUR_API_KEY' },
            ...[...new Map(METHODS.flatMap((m) => m.params).map((p) => [p.name, p])).values()].map((p) => ({
              name: p.name,
              in: 'query',
              required: false,
              description: p.desc,
              schema: { type: 'string' },
              example: p.example,
            })),
          ],
          responses: {
            '200': { description: 'Plain text or JSON, depending on the action', content: { 'text/plain': { schema: { type: 'string' } }, 'application/json': { schema: { type: 'object' } } } },
            '401': { description: 'BAD_KEY' },
          },
        },
      },
    },
  };
  return Response.json(spec, { headers: { 'cache-control': 'public, max-age=300' } });
}
