import { GROUPS, METHODS } from '@/lib/api-methods';

/** Postman v2.1 collection, one request per method, with the key as a collection variable (placeholder value). */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const u = new URL(`${origin}/stubs/handler_api.php`);
  const item = GROUPS.map((group) => ({
    name: group,
    item: METHODS.filter((m) => m.group === group).map((m) => ({
      name: m.name,
      request: {
        method: 'GET',
        description: m.desc,
        url: {
          raw: `${u.origin}${u.pathname}?action=${m.name}${m.params.map((p) => `&${p.name}=${p.example ?? ''}`).join('')}&api_key={{api_key}}`,
          protocol: u.protocol.replace(':', ''),
          host: [u.hostname],
          port: u.port || undefined,
          path: u.pathname.split('/').filter(Boolean),
          query: [{ key: 'action', value: m.name }, ...m.params.map((p) => ({ key: p.name, value: p.example ?? '', description: p.desc, disabled: !p.required })), { key: 'api_key', value: '{{api_key}}' }],
        },
      },
    })),
  })).filter((g) => g.item.length);

  const collection = {
    info: { name: 'SMSGecko API (SMS-Activate-compatible)', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [{ key: 'api_key', value: 'YOUR_API_KEY' }],
    item,
  };
  return new Response(JSON.stringify(collection, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="smsgecko.postman_collection.json"' },
  });
}
