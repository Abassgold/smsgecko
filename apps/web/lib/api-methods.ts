/**
 * Single source of truth for the SMS-Activate-compatible API docs: the /api-docs page, /api-docs/openapi.json and the
 * Postman export all read this list. It documents exactly what apps/api/src/controllers/activate.controller.ts implements.
 */
export interface ApiParam { name: string; required?: boolean; desc: string; example?: string }
export interface ApiResponse { label: string; status: number; body: string; desc: string }
export interface ApiMethod {
  name: string;
  group: string;
  desc: string;
  notes?: string[];
  params: ApiParam[];
  responses: ApiResponse[];
}

export const GROUPS = ['Account', 'Buy numbers', 'Status & activations', 'Prices & availability', 'Catalog'] as const;

const BAD_KEY: ApiResponse = { label: 'BAD_KEY', status: 401, body: 'BAD_KEY', desc: 'The api_key is missing, wrong or revoked, or the account is suspended. Returned before any method runs, for every method.' };

export const METHODS: ApiMethod[] = [
  {
    name: 'getBalance',
    group: 'Account',
    desc: 'Current account balance in US dollars.',
    params: [],
    responses: [{ label: 'Balance', status: 200, body: 'ACCESS_BALANCE:12.3400', desc: 'The token, a colon, then the balance with 4 decimals.' }, BAD_KEY],
  },
  {
    name: 'getNumber',
    group: 'Buy numbers',
    desc: 'Buys a number for a service and country. The price is charged to your balance immediately.',
    notes: [
      'If no SMS arrives the number is refunded automatically, or you can cancel it yourself with setStatus (status=8).',
      'Use getServicesList and getCountries to find valid service codes and country ids.',
    ],
    params: [
      { name: 'service', required: true, desc: 'Service code, e.g. wa for WhatsApp.', example: 'wa' },
      { name: 'country', required: true, desc: 'Numeric country id from getCountries (e.g. 187 = United States).', example: '187' },
      { name: 'maxPrice', desc: 'Highest price in USD you will pay, a plain decimal like 0.50. We sell the cheapest number at or under it; if even the cheapest is dearer you get WRONG_MAX_PRICE and nothing is bought. With fixedPrice=true it is the exact price to buy instead.', example: '0.50' },
      { name: 'fixedPrice', desc: 'Set to true to buy at exactly maxPrice, one of the price tiers listed by getPricesV2. A price that is not on the list answers NO_NUMBERS.', example: 'true' },
    ],
    responses: [
      { label: 'Number', status: 200, body: 'ACCESS_NUMBER:4829371650:15551234567', desc: 'ACCESS_NUMBER:<activation id>:<phone number without +>. The id is a 10-digit number: keep it for getStatus and setStatus.' },
      { label: 'WRONG_MAX_PRICE', status: 400, body: 'WRONG_MAX_PRICE:0.3', desc: 'The current price (after the colon, in USD) is above your maxPrice. Nothing was bought.' },
      { label: 'NO_NUMBERS', status: 200, body: 'NO_NUMBERS', desc: 'Nothing available for that service and country right now.' },
      { label: 'NO_BALANCE', status: 200, body: 'NO_BALANCE', desc: 'Your balance is lower than the price.' },
      { label: 'BAD_SERVICE', status: 200, body: 'BAD_SERVICE', desc: 'Unknown service code.' },
      { label: 'BAD_COUNTRY', status: 200, body: 'BAD_COUNTRY', desc: 'Unknown country id.' },
      BAD_KEY,
    ],
  },
  {
    name: 'getNumberV2',
    group: 'Buy numbers',
    desc: 'Same purchase as getNumber, but a successful answer is a JSON object with the number, price and times.',
    notes: ['Errors are the same plain-text tokens as getNumber (NO_NUMBERS, NO_BALANCE, BAD_SERVICE, BAD_COUNTRY, WRONG_MAX_PRICE).'],
    params: [
      { name: 'service', required: true, desc: 'Service code, e.g. wa for WhatsApp.', example: 'wa' },
      { name: 'country', required: true, desc: 'Numeric country id.', example: '187' },
      { name: 'maxPrice', desc: 'Highest price in USD you will pay (the exact price with fixedPrice=true).', example: '0.50' },
      { name: 'fixedPrice', desc: 'true = buy at exactly maxPrice, a tier from getPricesV2.', example: 'true' },
    ],
    responses: [
      {
        label: 'Number',
        status: 200,
        body: '{\n  "activationId": "4829371650",\n  "phoneNumber": "15551234567",\n  "activationCost": 0.3,\n  "currency": 840,\n  "countryCode": "187",\n  "canGetAnotherSms": true,\n  "activationTime": "2026-10-21T16:20:00.000Z",\n  "activationEndTime": "2026-10-21T16:40:00.000Z",\n  "activationOperator": null\n}',
        desc: 'activationCost is in USD. Use activationId with getStatus / setStatus.',
      },
      { label: 'WRONG_MAX_PRICE', status: 400, body: 'WRONG_MAX_PRICE:0.3', desc: 'The current price is above your maxPrice. Nothing was bought. Plain text, like getNumber.' },
      { label: 'NO_NUMBERS', status: 200, body: 'NO_NUMBERS', desc: 'Nothing available for that service and country right now.' },
      BAD_KEY,
    ],
  },
  {
    name: 'getStatus',
    group: 'Status & activations',
    desc: 'Checks whether the SMS for an activation has arrived.',
    notes: ['Poll every 5 seconds or so; asking more often gives the same answer.'],
    params: [{ name: 'id', required: true, desc: 'Activation id returned by getNumber.', example: '4829371650' }],
    responses: [
      { label: 'Waiting', status: 200, body: 'STATUS_WAIT_CODE', desc: 'No SMS yet.' },
      { label: 'Code received', status: 200, body: 'STATUS_OK:123456', desc: 'The SMS arrived: the code follows the colon.' },
      { label: 'Waiting for another SMS', status: 200, body: 'STATUS_WAIT_RETRY:123456', desc: 'You asked for another SMS (setStatus 3). The code after the colon is the previous one, shown until the new one arrives.' },
      { label: 'Canceled', status: 200, body: 'STATUS_CANCEL', desc: 'The activation was canceled or expired and refunded.' },
      { label: 'NO_ACTIVATION', status: 200, body: 'NO_ACTIVATION', desc: 'Unknown id, or it belongs to another account.' },
      BAD_KEY,
    ],
  },
  {
    name: 'getStatusV2',
    group: 'Status & activations',
    desc: 'Like getStatus, but the answer is JSON: a verification type and an sms block once the code has arrived.',
    notes: ['Canceled or expired activations answer STATUS_CANCEL and unknown ids answer NO_ACTIVATION, as plain text.'],
    params: [{ name: 'id', required: true, desc: 'Activation id returned by getNumber.', example: '4829371650' }],
    responses: [
      { label: 'Waiting', status: 200, body: '{ "verificationType": 0, "sms": null, "call": null }', desc: 'No SMS yet.' },
      { label: 'Code received', status: 200, body: '{\n  "verificationType": 0,\n  "sms": { "dateTime": "2026-10-21T16:21:03.000Z", "code": "123456", "text": "123456" },\n  "call": null\n}', desc: 'The SMS arrived.' },
      { label: 'Canceled', status: 200, body: 'STATUS_CANCEL', desc: 'The activation was canceled or expired.' },
      { label: 'NO_ACTIVATION', status: 200, body: 'NO_ACTIVATION', desc: 'Unknown id.' },
      BAD_KEY,
    ],
  },
  {
    name: 'getActiveActivations',
    group: 'Status & activations',
    desc: 'Your numbers that are still waiting for an SMS, plus the ones that finished in the last 30 minutes. Newest first.',
    params: [
      { name: 'start', desc: 'Offset for paging.', example: '0' },
      { name: 'limit', desc: 'How many to return (default 50, max 100).', example: '50' },
    ],
    responses: [
      {
        label: 'Activations',
        status: 200,
        body: '{\n  "status": "success",\n  "data": [\n    {\n      "activationId": "4829371650",\n      "serviceCode": "wa",\n      "phoneNumber": "15551234567",\n      "activationCost": 0.3,\n      "activationStatus": "1",\n      "smsCode": null,\n      "smsText": null,\n      "activationTime": "2026-10-21T16:20:00.000Z",\n      "countryCode": "187",\n      "countryName": "United States",\n      "canGetAnotherSms": false,\n      "currency": 840\n    }\n  ]\n}',
        desc: 'activationStatus: 1 = waiting for the first SMS, 3 = waiting for another SMS, 6 = done. canGetAnotherSms is true once a code has arrived and the number has not expired.',
      },
      BAD_KEY,
    ],
  },
  {
    name: 'setStatus',
    group: 'Status & activations',
    desc: 'Changes an activation: cancel it for a refund, ask for another SMS, or mark it finished.',
    notes: [
      'A number can only be canceled while it is still waiting. Right after purchase the answer is EARLY_CANCEL_DENIED; try again in a couple of minutes.',
      'The refund is paid only once the cancel is confirmed. If it cannot be confirmed right now you get BAD_ACTION (HTTP 503), nothing is refunded and the activation is untouched: try again shortly.',
      'If the SMS arrives while you cancel, the cancel is not applied: you get STATUS_OK:<code> and keep the number.',
      'status=3 asks for another SMS on the same number. It only works after a code has arrived and before the number expires; otherwise BAD_STATUS.',
      'Cancelling while you wait for a second SMS (after status 3) does not refund anything: the first code was already delivered. The activation just stops waiting and keeps its last code.',
    ],
    params: [
      { name: 'id', required: true, desc: 'Activation id returned by getNumber.', example: '4829371650' },
      { name: 'status', required: true, desc: '8 = cancel and refund, 6 = finish, 3 = request another SMS (after a code arrived), 1 = ready.', example: '8' },
    ],
    responses: [
      { label: 'Canceled', status: 200, body: 'ACCESS_CANCEL', desc: 'status=8 accepted; the price was refunded.' },
      { label: 'Finished', status: 200, body: 'ACCESS_ACTIVATION', desc: 'status=6 accepted. Only once the code has arrived; before that the answer is BAD_STATUS.' },
      { label: 'Ready', status: 200, body: 'ACCESS_READY', desc: 'status=1 accepted.' },
      { label: 'Another SMS', status: 200, body: 'ACCESS_RETRY_GET', desc: 'status=3 accepted: the same number now waits for a new SMS (getStatus answers STATUS_WAIT_RETRY meanwhile).' },
      { label: 'SMS already arrived', status: 200, body: 'STATUS_OK:123456', desc: 'Nothing was cancelled or refunded because a code had already arrived. This also happens if you cancel while waiting for another SMS (status 3): the activation stops waiting and keeps its last code.' },
      { label: 'Provider unavailable', status: 503, body: 'BAD_ACTION', desc: 'status=8 could not be confirmed right now. Nothing was refunded and nothing changed: try again shortly.' },
      { label: 'EARLY_CANCEL_DENIED', status: 200, body: 'EARLY_CANCEL_DENIED', desc: 'Too soon after purchase to cancel.' },
      { label: 'NO_ACTIVATION', status: 200, body: 'NO_ACTIVATION', desc: 'Unknown id.' },
      { label: 'BAD_STATUS', status: 200, body: 'BAD_STATUS', desc: 'Unsupported status, or the action is not possible in the activation’s current state (status=6 before a code arrived, status=3 before a code arrived or after the number expired).' },
      BAD_KEY,
    ],
  },
  {
    name: 'getPrices',
    group: 'Prices & availability',
    desc: 'Cheapest price and total stock, keyed by country id and then service code. For every price tier use getPricesV2.',
    notes: [
      'Leave service out for every service, country out for every country. Without a service the answer comes from our stored catalog, refreshed every 2 hours; the price you are charged is always checked live when you buy.',
    ],
    params: [
      { name: 'service', desc: 'Only this service code.', example: 'wa' },
      { name: 'country', desc: 'Only this country id.', example: '187' },
    ],
    responses: [
      { label: 'Prices', status: 200, body: '{\n  "187": {\n    "wa": { "cost": "0.3000", "count": 107122 }\n  }\n}', desc: 'cost is the price in USD; count is how many numbers are in stock. Sold-out countries are left out.' },
      { label: 'BAD_SERVICE', status: 200, body: 'BAD_SERVICE', desc: 'Unknown service, or no service given while the stored catalog is not ready yet (try again in a minute, or pass a service).' },
      BAD_KEY,
    ],
  },
  {
    name: 'getPricesV2',
    group: 'Prices & availability',
    desc: 'Every price tier. Higher prices can buy numbers with better delivery. Buy a tier with getNumber and fixedPrice=true.',
    notes: ['Leave service out for every service (from our stored catalog, refreshed every 2 hours). The price you are charged is always checked live when you buy.'],
    params: [
      { name: 'service', desc: 'Only this service code.', example: 'wa' },
      { name: 'country', desc: 'Only this country id.', example: '187' },
    ],
    responses: [
      {
        label: 'Prices',
        status: 200,
        body: '{\n  "187": {\n    "wa": {\n      "prices": { "0.3000": 76609, "0.4260": 1000 },\n      "saleAveragePrice": 0.3\n    }\n  }\n}',
        desc: 'prices maps a price in USD to the numbers on sale at that price. saleAveragePrice is the cheapest tier.',
      },
      { label: 'BAD_SERVICE', status: 200, body: 'BAD_SERVICE', desc: 'Unknown service, or no service given while the stored catalog is not ready yet.' },
      BAD_KEY,
    ],
  },
  {
    name: 'getServicesList',
    group: 'Catalog',
    desc: 'All services you can buy numbers for, with the code to use as the service parameter.',
    params: [],
    responses: [{ label: 'Services', status: 200, body: '{\n  "status": "success",\n  "services": [\n    { "code": "wa", "name": "WhatsApp" }\n  ]\n}', desc: 'JSON list of code + name.' }, BAD_KEY],
  },
  {
    name: 'getCountries',
    group: 'Catalog',
    desc: 'All countries, with the numeric id to use as the country parameter.',
    params: [],
    responses: [{ label: 'Countries', status: 200, body: '[\n  { "id": "187", "eng": "United States", "iso": "us" }\n]', desc: 'JSON array of id, English name and ISO code.' }, BAD_KEY],
  },
];

export const KEY_TOKEN = '{{API_KEY}}';

/** Request URL with the key as a token, so the page can show it masked while Copy puts the real key on the clipboard. */
export function buildUrl(base: string, m: ApiMethod, values: Record<string, string>) {
  const q = new URLSearchParams({ action: m.name });
  for (const p of m.params) {
    const v = values[p.name]?.trim();
    if (v) q.set(p.name, v);
  }
  return `${base}?${q.toString()}&api_key=${KEY_TOKEN}`;
}

export type Lang = 'URL' | 'cURL' | 'JavaScript' | 'PHP';

export function snippet(lang: Lang, url: string) {
  switch (lang) {
    case 'URL':
      return url;
    case 'cURL':
      return `curl "${url}"`;
    case 'JavaScript':
      return `const res = await fetch("${url}");\nconst text = await res.text();\nconsole.log(text);`;
    case 'PHP':
      return `<?php\n$response = file_get_contents("${url}");\necho $response;`;
  }
}

/** Methods that spend or change something on the account: the page warns before Execute. */
export const MUTATING = new Set(['getNumber', 'getNumberV2', 'setStatus']);
