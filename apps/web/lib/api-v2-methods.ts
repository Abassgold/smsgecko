/*
 * The /api/v2 REST API, described once. The docs page (/docs/v2), the OpenAPI file and the Postman collection are all built
 * from this list, so they cannot disagree with each other. Everything here was read from the API's own code
 * (apps/api/src/routes/v2.routes.ts, controllers/v2.controller.ts, services/v2.*.ts, lib/webhooks.ts) and checked against a
 * running API: when the API changes, change this file in the same commit.
 */
export type V2Where = 'body' | 'query' | 'path' | 'header';

export interface V2Param {
  name: string;
  in: V2Where;
  required: boolean;
  desc: string;
  example?: string;
}

export interface V2Response {
  label: string;
  status: number;
  desc: string;
  body: string;
}

export interface V2Method {
  /** Anchor id and Postman/OpenAPI operation id. */
  id: string;
  group: 'Account' | 'Catalog' | 'Orders' | 'Webhook';
  method: 'GET' | 'POST' | 'PATCH';
  /** Path under /api/v2. `:id` is an order id. */
  path: string;
  /** Other addresses that run exactly the same handler. */
  alsoAt?: { method: 'POST'; path: string; note: string }[];
  title: string;
  desc: string;
  notes?: string[];
  params: V2Param[];
  /** JSON body used in the example request, when the call takes one. */
  sampleBody?: Record<string, unknown>;
  responses: V2Response[];
}

export const V2_GROUPS = ['Account', 'Catalog', 'Orders', 'Webhook'] as const;

const ORDER = `{
  "success": true,
  "data": {
    "id": "SG-4F2K-9X",
    "status": "waiting",
    "product": { "service": "WhatsApp", "country": "United States" },
    "phone_number": "+15551234567",
    "price": "0.5",
    "otp_code": null,
    "sms": [],
    "created_at": "2026-11-21T16:40:12.000Z",
    "expires_at": "2026-11-21T16:55:12.000Z",
    "finished_at": null
  }
}`;

const ORDER_WITH_CODE = `{
  "success": true,
  "data": {
    "id": "SG-4F2K-9X",
    "status": "completed",
    "product": { "service": "WhatsApp", "country": "United States" },
    "phone_number": "+15551234567",
    "price": "0.5",
    "otp_code": "482913",
    "sms": [
      { "sender": "WhatsApp", "text": "Your WhatsApp code: 482-913", "received_at": "2026-11-21T16:41:03.000Z" }
    ],
    "created_at": "2026-11-21T16:40:12.000Z",
    "expires_at": "2026-11-21T16:55:12.000Z",
    "finished_at": null
  }
}`;

const err = (code: string, message: string) => `{
  "success": false,
  "error": { "code": "${code}", "message": "${message}" }
}`;

const UNAUTHORIZED: V2Response = {
  label: 'No or bad key',
  status: 401,
  desc: 'The Authorization header is missing, or the key is wrong or revoked.',
  body: err('UNAUTHORIZED', 'Missing Bearer token'),
};

const NOT_FOUND_ORDER: V2Response = {
  label: 'Unknown order',
  status: 404,
  desc: 'No order with that id on your account.',
  body: err('NOT_FOUND', 'Order not found'),
};

const ID_PARAM: V2Param = {
  name: 'id',
  in: 'path',
  required: true,
  desc: 'The order id from the create call, like SG-4F2K-9X.',
  example: 'SG-4F2K-9X',
};

const ID_BODY_NOTE = 'Also available as a body call: send { "id": "SG-4F2K-9X" } to the address without the id in it. Both run the same handler.';

export const V2_METHODS: V2Method[] = [
  /* ---------------------------------------------------------------- Account */
  {
    id: 'getBalance',
    group: 'Account',
    method: 'GET',
    path: '/balance',
    title: 'Get balance',
    desc: 'Your current balance in US dollars, as a plain decimal string with no currency symbol.',
    params: [],
    responses: [{ label: 'OK', status: 200, desc: 'Your balance.', body: '{\n  "success": true,\n  "data": { "balance": "5.0" }\n}' }, UNAUTHORIZED],
  },

  /* ---------------------------------------------------------------- Catalog */
  {
    id: 'listProducts',
    group: 'Catalog',
    method: 'GET',
    path: '/catalog/products',
    title: 'List products',
    desc: 'What you can buy. Without `service` it lists the services themselves (name and id, no prices). With `service` it lists that service in every country, with the live price and stock, one row per price option.',
    notes: [
      'The `id` of a row is what you send as catalog_product_id when you create an order. It looks like "<service>::<country>" for the cheapest option and "<service>::<country>::<n>" for the next ones. Always copy it from this list: do not build it by hand.',
      'Prices are in US dollars. `stock` is how many numbers are available at that price.',
      'Prices and stock change all the time. The price you are charged is the live price when you create the order, which is why create takes a max_price.',
    ],
    params: [
      { name: 'service', in: 'query', required: false, desc: 'A service id from the list you get without it. Set it to get prices.', example: 'wa' },
      { name: 'country', in: 'query', required: false, desc: 'Only this country (with `service`).', example: 'us' },
      { name: 'search', in: 'query', required: false, desc: 'Without `service`: filter the service list by name or code (up to 100 characters).', example: 'whats' },
      { name: 'limit', in: 'query', required: false, desc: '1 to 500. Defaults to 200.', example: '50' },
    ],
    responses: [
      {
        label: 'Priced products',
        status: 200,
        desc: 'With `service` set: one row per country and price option.',
        body: `{
  "success": true,
  "data": [
    {
      "id": "wa::us",
      "service": "wa",
      "service_slug": "wa",
      "country": "United States",
      "country_code": "us",
      "operator": null,
      "price": "0.5",
      "stock": 1200
    },
    {
      "id": "wa::us::1",
      "service": "wa",
      "service_slug": "wa",
      "country": "United States",
      "country_code": "us",
      "operator": null,
      "price": "0.8",
      "stock": 640
    }
  ]
}`,
      },
      UNAUTHORIZED,
    ],
  },

  /* ----------------------------------------------------------------- Orders */
  {
    id: 'createOrder',
    group: 'Orders',
    method: 'POST',
    path: '/orders',
    alsoAt: [{ method: 'POST', path: '/orders/create', note: 'Same handler. Use whichever reads better in your logs.' }],
    title: 'Create an order',
    desc: 'Buys a number. Your balance is charged at once and the number comes back in `phone_number`. Enter it on the service, then poll the order until `otp_code` is filled.',
    notes: [
      'Send the body as JSON and set the header Content-Type: application/json. Without it the body is ignored and you get "catalog_product_id is required".',
      'Send an Idempotency-Key header (8 to 128 characters, a new UUID per purchase). If your request times out, send the same call again with the same key: you get the same order back and are charged once. The same key with a different body is refused (IDEMPOTENCY_KEY_REUSED).',
      'max_price is your safety cap, a plain decimal like "0.50" with up to 6 decimal places. If the live price is higher, nothing is bought and nothing is charged.',
      'If no SMS arrives before expires_at, the order is cancelled and your money comes back automatically.',
    ],
    params: [
      { name: 'Idempotency-Key', in: 'header', required: false, desc: '8 to 128 characters. Strongly recommended.', example: '3f9c2c1e-7b0a-4c58-9d3e-1a2b3c4d5e6f' },
      { name: 'catalog_product_id', in: 'body', required: true, desc: 'A product id copied from the catalog list. (product_id is accepted as another name for it.)', example: 'wa::us' },
      { name: 'max_price', in: 'body', required: false, desc: 'The most you will pay, in dollars, as a string.', example: '0.50' },
      { name: 'operator_id', in: 'body', required: false, desc: 'Pick the cheapest option for this carrier instead of the option in the product id.' },
      { name: 'quantity', in: 'body', required: false, desc: 'Only 1 is allowed today.', example: '1' },
    ],
    sampleBody: { catalog_product_id: 'wa::us', max_price: '0.50' },
    responses: [
      { label: 'Created', status: 201, desc: 'The order, waiting for its SMS. A repeat with the same Idempotency-Key returns the same order, with its messages so far.', body: ORDER },
      {
        label: 'Bad request',
        status: 400,
        desc: 'No product id, a product id that is not in the "<service>::<country>[::<n>]" form, a max_price that is not a plain decimal, or an invalid Idempotency-Key.',
        body: err('BAD_REQUEST', 'catalog_product_id must be \\"<service>::<country>[::<tier>]\\" from /v2/catalog/products'),
      },
      UNAUTHORIZED,
      { label: 'Not enough balance', status: 402, desc: 'Your balance is lower than the price. Nothing was bought.', body: err('INSUFFICIENT_BALANCE', 'Insufficient balance') },
      { label: 'Still being created', status: 409, desc: 'Another call with the same Idempotency-Key is still running. Wait a moment and send it again.', body: err('REQUEST_IN_PROGRESS', 'A create request with this idempotency key is still in progress') },
      { label: 'Price above your cap', status: 422, desc: 'The live price is above your max_price. Nothing was bought.', body: err('UNPROCESSABLE', 'Current price is above your max price') },
      { label: 'Nothing for that product', status: 422, desc: 'No numbers are available for that product right now.', body: err('NO_OFFER_AVAILABLE', 'No active offer matches that product and policy') },
      { label: 'Key reused', status: 422, desc: 'That Idempotency-Key was already used with a different body.', body: err('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different request body') },
      { label: 'No numbers right now', status: 422, desc: 'Every provider answered that it has no numbers for that product at the moment. Nothing was charged. Try again shortly or pick another product.', body: err('PROVIDER_ERROR', 'No numbers are available for this service right now — please try again shortly.') },
      { label: 'No provider on', status: 409, desc: 'Nothing can be sold at the moment because no number provider is switched on. Nothing was charged. Try again shortly.', body: err('CONFLICT', 'No SMS provider is enabled') },
      { label: 'Paused', status: 503, desc: 'Ordering is paused for maintenance, or the numbers are unavailable for a moment. Nothing was charged. Try again shortly.', body: err('SERVICE_UNAVAILABLE', 'Ordering is paused for maintenance') },
    ],
  },
  {
    id: 'getOrder',
    group: 'Orders',
    method: 'GET',
    path: '/orders/:id',
    title: 'Get an order',
    desc: 'The current state of one order, with every SMS received so far. Poll this to wait for the code.',
    notes: [
      'Poll every 5 seconds. A code rarely arrives sooner, and your account shares a limit of 300 requests a minute per IP.',
      'Stop when status is no longer "waiting". "completed" means a code arrived (otp_code); "canceled" and "expired" mean you were refunded.',
    ],
    params: [ID_PARAM],
    responses: [
      { label: 'Waiting', status: 200, desc: 'No code yet.', body: ORDER },
      { label: 'Code received', status: 200, desc: 'status is "completed" and otp_code is set.', body: ORDER_WITH_CODE },
      NOT_FOUND_ORDER,
      UNAUTHORIZED,
    ],
  },
  {
    id: 'getActiveOrders',
    group: 'Orders',
    method: 'GET',
    path: '/orders/active',
    title: 'List active orders',
    desc: 'Every order of yours that is still waiting for its SMS. Useful to pick up where you left off after a restart.',
    params: [],
    responses: [
      { label: 'OK', status: 200, desc: 'An array of orders (empty when nothing is waiting). The messages list is empty here: fetch one order to see its SMS.', body: `{\n  "success": true,\n  "data": [\n    { "id": "SG-4F2K-9X", "status": "waiting", "phone_number": "+15551234567", "…": "same fields as one order" }\n  ]\n}` },
      UNAUTHORIZED,
    ],
  },
  {
    id: 'finishOrder',
    group: 'Orders',
    method: 'POST',
    path: '/orders/:id/finish',
    alsoAt: [{ method: 'POST', path: '/orders/finish', note: 'Body call: { "id": "SG-4F2K-9X" }.' }],
    title: 'Finish an order',
    desc: 'Tell us you are done with a number whose code you used. It sets finished_at and releases the number. Calling it again changes nothing.',
    notes: [ID_BODY_NOTE],
    params: [ID_PARAM],
    responses: [{ label: 'Finished', status: 200, desc: 'The order, with finished_at set.', body: ORDER_WITH_CODE.replace('"finished_at": null', '"finished_at": "2026-11-21T16:42:00.000Z"') }, NOT_FOUND_ORDER, UNAUTHORIZED],
  },
  {
    id: 'cancelOrder',
    group: 'Orders',
    method: 'POST',
    path: '/orders/:id/cancel',
    alsoAt: [{ method: 'POST', path: '/orders/cancel', note: 'Body call: { "id": "SG-4F2K-9X" }.' }],
    title: 'Cancel an order',
    desc: 'Cancel a number that has not received a code and get a full refund. The provider confirms the cancel first, and you are refunded only when it does.',
    notes: [
      ID_BODY_NOTE,
      'A number cannot be cancelled in its first couple of minutes (CANCEL_TOO_EARLY). Try again after a short wait, or let it expire and it is refunded automatically.',
      'An order that already has a code, or is no longer waiting, cannot be cancelled (409 CONFLICT).',
      'While waiting for a SECOND SMS (after you asked for another one) there is nothing to refund: the call succeeds, the order goes back to "completed" with its first code, and no money moves.',
    ],
    params: [ID_PARAM],
    responses: [
      { label: 'Canceled', status: 200, desc: 'The order with status "canceled". Your balance has been refunded.', body: ORDER.replace('"waiting"', '"canceled"') },
      { label: 'Too early', status: 409, desc: 'Too soon after purchase to cancel.', body: err('CANCEL_TOO_EARLY', 'This number can be cancelled a couple of minutes after purchase. Please try again shortly.') },
      { label: 'Not cancellable', status: 409, desc: 'The order already received a code, or is already canceled or expired.', body: err('CONFLICT', 'Order already received a code') },
      { label: 'Could not confirm', status: 503, desc: 'The provider could not be asked just now. Nothing was refunded; try again shortly.', body: err('PROVIDER_UNAVAILABLE', 'Could not cancel right now. Please try again shortly.') },
      NOT_FOUND_ORDER,
      UNAUTHORIZED,
    ],
  },
  {
    id: 'resendOrder',
    group: 'Orders',
    method: 'POST',
    path: '/orders/:id/resend',
    alsoAt: [{ method: 'POST', path: '/orders/resend', note: 'Body call: { "id": "SG-4F2K-9X" }.' }],
    title: 'Ask for another SMS',
    desc: 'Once a code has arrived, ask for another SMS on the same number. It is free: no new number is bought and you are not charged. The order goes back to "waiting", and the code you already had moves out of the way so the new one can be told apart.',
    notes: [
      ID_BODY_NOTE,
      'Only after the first code has arrived and before expires_at. An order that is still waiting for its first SMS, or one that has expired, is refused.',
      'This is the same thing as setStatus=3 on the SMS-Activate protocol: both call the same code.',
      'If you cancel while waiting for the second SMS, nothing is refunded (the first code was delivered and paid for) and the order goes back to "completed" with its first code.',
      'Allowed at most once every 5 seconds, counting calls on both addresses. Not every number supports it.',
    ],
    params: [ID_PARAM],
    responses: [
      {
        label: 'Waiting again',
        status: 200,
        desc: 'The order is waiting for the next SMS. otp_code is empty until it arrives, and the earlier message stays in the sms list.',
        body: ORDER_WITH_CODE.replace('"status": "completed"', '"status": "waiting"').replace('"otp_code": "482913"', '"otp_code": null'),
      },
      { label: 'No code yet', status: 409, desc: 'The order is still waiting for its first SMS, or is already canceled or expired.', body: err('CONFLICT', 'Another SMS can only be requested after a code has arrived') },
      { label: 'Expired', status: 409, desc: 'The number has expired.', body: err('CONFLICT', 'This number has expired') },
      { label: 'Not supported', status: 409, desc: 'This number does not support another SMS.', body: err('CONFLICT', 'This number does not support requesting another code') },
      { label: 'Provider refused', status: 503, desc: 'The provider could not be reached or refused. The order is untouched and you were not charged. Try again shortly.', body: err('PROVIDER_UNAVAILABLE', 'Could not request another SMS right now. Please try again shortly.') },
      NOT_FOUND_ORDER,
      UNAUTHORIZED,
    ],
  },

  /* ---------------------------------------------------------------- Webhook */
  {
    id: 'getWebhook',
    group: 'Webhook',
    method: 'GET',
    path: '/webhook',
    title: 'Get your webhook',
    desc: 'Your current webhook address and its signing secret (both null when none is set).',
    params: [],
    responses: [{ label: 'OK', status: 200, desc: 'Your webhook settings.', body: '{\n  "success": true,\n  "data": {\n    "webhook_url": "https://example.com/hooks/smsgecko",\n    "webhook_secret": "k3J9…"\n  }\n}' }, UNAUTHORIZED],
  },
  {
    id: 'patchWebhook',
    group: 'Webhook',
    method: 'PATCH',
    path: '/webhook',
    title: 'Set your webhook',
    desc: 'Set, change or clear your webhook. Send only the fields you want to change.',
    notes: [
      'The address must be https and public: localhost, .local and private network addresses are refused.',
      'If you set an address and have no secret yet, one is generated for you. Send regenerate_secret to replace it, or webhook_secret to choose your own.',
      'Send webhook_url as null to remove the webhook and its secret.',
    ],
    params: [
      { name: 'webhook_url', in: 'body', required: false, desc: 'An https address, or null to clear.', example: 'https://example.com/hooks/smsgecko' },
      { name: 'webhook_secret', in: 'body', required: false, desc: '16 to 128 characters. Wins over regenerate_secret.' },
      { name: 'regenerate_secret', in: 'body', required: false, desc: 'true to replace the secret with a new one we generate.', example: 'true' },
    ],
    sampleBody: { webhook_url: 'https://example.com/hooks/smsgecko', regenerate_secret: true },
    responses: [
      { label: 'Saved', status: 200, desc: 'Your webhook settings after the change.', body: '{\n  "success": true,\n  "data": {\n    "webhook_url": "https://example.com/hooks/smsgecko",\n    "webhook_secret": "k3J9…"\n  }\n}' },
      { label: 'Refused address', status: 400, desc: 'The address is not https, or is a local or private address.', body: err('BAD_REQUEST', 'webhookUrl must be an https:// URL, not a local or private address') },
      UNAUTHORIZED,
    ],
  },
  {
    id: 'testWebhook',
    group: 'Webhook',
    method: 'POST',
    path: '/webhook/test',
    title: 'Send a test webhook',
    desc: 'Sends a sample webhook.test event to your address right now, signed the same way as a real one, and tells you what your server answered.',
    params: [],
    responses: [
      { label: 'Delivered', status: 200, desc: '`delivered` is true when your server answered with a 2xx. `statusCode` is camelCase here, unlike the rest of the API.', body: '{\n  "success": true,\n  "data": { "delivered": true, "statusCode": 200 }\n}' },
      { label: 'No webhook set', status: 409, desc: 'Set an address first with PATCH /webhook.', body: err('CONFLICT', 'No webhook URL configured — set one with PATCH /webhook first') },
      UNAUTHORIZED,
    ],
  },
];

/** What the API sends to your webhook address. Only these events are sent today. */
export const WEBHOOK_EVENTS: string[][] = [
  ['order.otp_received', 'A code arrived for one of your orders. otp_code and otp_message are set.'],
  ['webhook.test', 'A sample, sent by POST /webhook/test.'],
];

export const WEBHOOK_PAYLOAD = `{
  "event": "order.otp_received",
  "timestamp": "2026-11-21T16:41:03.512Z",
  "data": {
    "order_id": "SG-4F2K-9X",
    "status": "completed",
    "phone_number": "+15551234567",
    "otp_code": "482913",
    "otp_message": "Your WhatsApp code: 482-913",
    "service": "WhatsApp",
    "country": "United States",
    "price": "0.5",
    "created_at": "2026-11-21T16:40:12.000Z",
    "expires_at": "2026-11-21T16:55:12.000Z",
    "finished_at": null
  }
}`;

/** Order statuses, in the order an order moves through them. */
export const ORDER_STATUS_ROWS: string[][] = [
  ['waiting', 'You have the number and are waiting for the SMS.'],
  ['completed', 'A code arrived. otp_code is set. Call finish when you are done with it.'],
  ['canceled', 'You cancelled it, and you were refunded.'],
  ['expired', 'No code arrived in time, and you were refunded automatically.'],
];

/** Every error code you can see from /api/v2, and what it means. */
export const ERROR_ROWS: string[][] = [
  ['BAD_REQUEST', '400', 'Something in the request is missing or malformed. The message says what. When a field is wrong, `details` lists each problem, like ["id is a required field"].'],
  ['UNAUTHORIZED', '401', 'No Bearer key, or a wrong or revoked key.'],
  ['INSUFFICIENT_BALANCE', '402', 'Your balance is lower than the price. Nothing was bought.'],
  ['FORBIDDEN', '403', 'The account is suspended.'],
  ['NOT_FOUND', '404', 'No such order (or no such address).'],
  ['CONFLICT', '409', 'Not possible in the order’s current state, for example cancelling an order that already has a code.'],
  ['CANCEL_TOO_EARLY', '409', 'Too soon after purchase to cancel.'],
  ['REQUEST_IN_PROGRESS', '409', 'A create call with the same Idempotency-Key is still running.'],
  ['UNPROCESSABLE', '422', 'The live price is above your max_price.'],
  ['NO_OFFER_AVAILABLE', '422', 'Nothing available for that product right now.'],
  ['IDEMPOTENCY_KEY_REUSED', '422', 'That Idempotency-Key was used with a different body.'],
  ['PROVIDER_ERROR', '422', 'No numbers are available for that product right now (create).'],
  ['RATE_LIMITED', '429', 'More than 300 requests a minute from your IP.'],
  ['SERVICE_UNAVAILABLE', '503', 'Ordering is paused for maintenance.'],
  ['PROVIDER_UNAVAILABLE', '503', 'Numbers are unavailable for a moment. Try again shortly.'],
  ['INTERNAL_ERROR', '500', 'Something went wrong on our side. Try again.'],
];

/** The signature check, as a copy-paste Node example. */
export const WEBHOOK_VERIFY_NODE = `import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody is the exact request body as a string. Do not re-serialise parsed JSON.
function isFromSMSGecko(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

// header: X-SMSGecko-Signature`;

/** The whole flow end to end, in curl. Used as the first example on the page. */
export const REST_QUICKSTART = (base: string) => `# 1. Find a product id (copy the "id" of the row you want)
curl "${base}/api/v2/catalog/products?service=wa&country=us" \\
  -H "Authorization: Bearer $SMSGECKO_TOKEN"

# 2. Buy the number (note the Content-Type header)
curl -X POST ${base}/api/v2/orders \\
  -H "Authorization: Bearer $SMSGECKO_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"catalog_product_id":"wa::us","max_price":"0.50"}'

# 3. Poll every 5 seconds until otp_code is filled
curl ${base}/api/v2/orders/$ORDER_ID \\
  -H "Authorization: Bearer $SMSGECKO_TOKEN"

# 4. Tell us you are done
curl -X POST ${base}/api/v2/orders/$ORDER_ID/finish \\
  -H "Authorization: Bearer $SMSGECKO_TOKEN"`;
