import { V2_GROUPS, V2_METHODS } from '@/lib/api-v2-methods';

/** Postman v2.1 collection for the REST API v2, one request per method. The key and base URL are collection variables. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const item = V2_GROUPS.map((group) => ({
    name: group,
    item: V2_METHODS.filter((m) => m.group === group).map((m) => {
      const path = m.path.replace(':id', '{{order_id}}');
      const query = m.params.filter((p) => p.in === 'query');
      const idemp = m.params.find((p) => p.name === 'Idempotency-Key');
      return {
        name: m.title,
        request: {
          method: m.method,
          description: [m.desc, ...(m.notes ?? [])].join('\n\n'),
          header: [
            { key: 'Authorization', value: 'Bearer {{token}}' },
            ...(m.sampleBody ? [{ key: 'Content-Type', value: 'application/json' }] : []),
            ...(idemp ? [{ key: 'Idempotency-Key', value: '{{$guid}}' }] : []),
          ],
          ...(m.sampleBody ? { body: { mode: 'raw', raw: JSON.stringify(m.sampleBody, null, 2), options: { raw: { language: 'json' } } } } : {}),
          url: {
            raw: `{{baseUrl}}/api/v2${path}${query.length ? `?${query.map((p) => `${p.name}=${p.example ?? ''}`).join('&')}` : ''}`,
            host: ['{{baseUrl}}'],
            path: ['api', 'v2', ...path.split('/').filter(Boolean)],
            query: query.map((p) => ({ key: p.name, value: p.example ?? '', description: p.desc, disabled: !p.required })),
          },
        },
      };
    }),
  }));

  const collection = {
    info: { name: 'SMSGecko REST API v2', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [
      { key: 'baseUrl', value: origin },
      { key: 'token', value: 'smsg_live_YOUR_API_KEY' },
      { key: 'order_id', value: 'SG-4F2K-9X' },
    ],
    item,
  };
  return new Response(JSON.stringify(collection, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="smsgecko-v2.postman_collection.json"' },
  });
}
