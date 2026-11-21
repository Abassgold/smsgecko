import type { CodeTab } from '@/components/ui/code-block';
import type { QA } from '@/components/ui/accordion';
import { REST_QUICKSTART } from '@/lib/api-v2-methods';

export const HERO_STATS = [
  { value: '200+', label: 'Countries' },
  { value: '1,000+', label: 'Platforms' },
  { value: '99.5%', label: 'Uptime' },
  { value: '<30s', label: 'Avg OTP' },
];

export const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Pick service & country',
    body: 'Filter live inventory by platform and country. Prices and stock are shown before you buy.',
  },
  {
    step: '02',
    title: 'Get a number instantly',
    body: 'A real number is assigned to you and starts listening for the verification SMS.',
  },
  {
    step: '03',
    title: 'Receive the OTP',
    body: "Poll via dashboard or API. No SMS in the window? You're refunded automatically.",
  },
];

/*
 * The landing page Quick Start: the SMS-Activate protocol (/stubs/handler_api.php), the same API the Mane SMS site shows, so
 * any SMS-Activate tool works by swapping the host. Answers are plain text (ACCESS_NUMBER:id:number, STATUS_OK:code...), not JSON.
 * Keep this in step with lib/api-methods.ts. The REST v2 version lives in V2_QUICK_START below.
 */
export const QUICK_START: CodeTab[] = [
  {
    label: 'cURL',
    language: 'bash',
    code: `API="https://www.smsgecko.com/stubs/handler_api.php"
KEY="YOUR_API_KEY"

# 1. Buy a WhatsApp number (United States = country 187). maxPrice is your safety cap in USD.
curl "$API?api_key=$KEY&action=getNumber&service=wa&country=187&maxPrice=0.50"
# ACCESS_NUMBER:4829371650:15551234567     (activation id : phone number)

# 2. Use that number on the service, then read the code. Repeat about every 5 seconds.
curl "$API?api_key=$KEY&action=getStatus&id=4829371650"
# STATUS_WAIT_CODE   (not yet)   ->   STATUS_OK:123456   (here it is)

# 3. Finished? Mark it done (status=6). No code in time? Cancel for a refund (status=8).
curl "$API?api_key=$KEY&action=setStatus&id=4829371650&status=6"
# ACCESS_ACTIVATION`,
  },
  {
    label: 'JavaScript',
    language: 'js',
    code: `// Node 20 or newer. Save as quickstart.mjs and run: node quickstart.mjs
const API = "https://www.smsgecko.com/stubs/handler_api.php";
const call = async (params) =>
  (await fetch(\`\${API}?\${new URLSearchParams({ api_key: process.env.SMSGECKO_KEY, ...params })}\`)).text();

// 1. Buy a WhatsApp number (United States = country 187). maxPrice is your safety cap in USD.
const bought = await call({ action: "getNumber", service: "wa", country: "187", maxPrice: "0.50" });
if (!bought.startsWith("ACCESS_NUMBER:")) throw new Error(bought); // NO_NUMBERS, NO_BALANCE, WRONG_MAX_PRICE:0.3 ...
const [, id, phone] = bought.split(":");
console.log("Use this number:", phone);

// 2. Poll every 5 seconds until the code arrives.
let status;
do {
  await new Promise((r) => setTimeout(r, 5000));
  status = await call({ action: "getStatus", id });
} while (status === "STATUS_WAIT_CODE");
console.log(status); // STATUS_OK:123456

// 3. Done: mark it finished.
if (status.startsWith("STATUS_OK:")) await call({ action: "setStatus", id, status: "6" });`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `# pip install requests
import os
import time

import requests

API = "https://www.smsgecko.com/stubs/handler_api.php"


def call(**params):
    params["api_key"] = os.environ["SMSGECKO_KEY"]
    return requests.get(API, params=params, timeout=20).text


# 1. Buy a WhatsApp number (United States = country 187). maxPrice is your safety cap in USD.
bought = call(action="getNumber", service="wa", country="187", maxPrice="0.50")
if not bought.startswith("ACCESS_NUMBER:"):
    raise RuntimeError(bought)  # NO_NUMBERS, NO_BALANCE, WRONG_MAX_PRICE:0.3 ...
_, activation_id, phone = bought.split(":")
print("Use this number:", phone)

# 2. Poll every 5 seconds until the code arrives.
while True:
    time.sleep(5)
    status = call(action="getStatus", id=activation_id)
    if status != "STATUS_WAIT_CODE":
        break
print(status)  # STATUS_OK:123456

# 3. Done: mark it finished.
if status.startswith("STATUS_OK:"):
    call(action="setStatus", id=activation_id, status="6")`,
  },
];

/*
 * The first example in the /docs/v2 reference (the REST API). Plain REST: the same four
 * steps in cURL, JavaScript and Python. The product id comes from the catalog list (never hard-coded) and every request that sends
 * JSON sets the content type. Keep this in step with lib/api-v2-methods.ts.
 */
export const V2_QUICK_START: CodeTab[] = [
  {
    label: 'cURL',
    language: 'bash',
    code: REST_QUICKSTART('https://www.smsgecko.com'),
  },
  {
    label: 'JavaScript',
    language: 'js',
    code: `// Node 20 or newer. Save as quickstart.mjs and run: node quickstart.mjs
const API = "https://www.smsgecko.com/api/v2";
const headers = { Authorization: \`Bearer \${process.env.SMSGECKO_TOKEN}\`, "Content-Type": "application/json" };

async function call(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...headers, ...init.headers } });
  const body = await res.json();
  if (!body.success) throw new Error(\`\${body.error.code}: \${body.error.message}\`);
  return body.data;
}

// 1. Find a product id. Rows are cheapest first.
const [product] = await call("/catalog/products?service=wa&country=us");

// 2. Buy the number. max_price is your safety cap; the Idempotency-Key makes a retry safe.
const order = await call("/orders", {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ catalog_product_id: product.id, max_price: "0.50" }),
});
console.log(order.phone_number);

// 3. Poll every 5 seconds until the code arrives (or the order ends).
let current = order;
while (current.status === "waiting") {
  await new Promise((r) => setTimeout(r, 5000));
  current = await call(\`/orders/\${order.id}\`);
}
console.log(current.otp_code ?? current.status);

// 4. Tell us you are done.
if (current.status === "completed") await call(\`/orders/\${order.id}/finish\`, { method: "POST" });`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `# pip install requests
import os
import time
import uuid

import requests

API = "https://www.smsgecko.com/api/v2"
session = requests.Session()
session.headers["Authorization"] = f"Bearer {os.environ['SMSGECKO_TOKEN']}"


def call(method, path, **kwargs):
    body = session.request(method, API + path, timeout=20, **kwargs).json()
    if not body["success"]:
        raise RuntimeError(f"{body['error']['code']}: {body['error']['message']}")
    return body["data"]


# 1. Find a product id. Rows are cheapest first.
product = call("GET", "/catalog/products", params={"service": "wa", "country": "us"})[0]

# 2. Buy the number. max_price is your safety cap; the Idempotency-Key makes a retry safe.
order = call(
    "POST",
    "/orders",
    json={"catalog_product_id": product["id"], "max_price": "0.50"},
    headers={"Idempotency-Key": str(uuid.uuid4())},
)
print(order["phone_number"])

# 3. Poll every 5 seconds until the code arrives (or the order ends).
current = order
while current["status"] == "waiting":
    time.sleep(5)
    current = call("GET", f"/orders/{order['id']}")
print(current["otp_code"] or current["status"])

# 4. Tell us you are done.
if current["status"] == "completed":
    call("POST", f"/orders/{order['id']}/finish")`,
  },
];

export const WHAT_IT_DOES = [
  {
    icon: 'inventory',
    title: 'Live inventory',
    body: 'Every number has a price and stock count shown up front. No surprises at checkout.',
  },
  {
    icon: 'refund',
    title: 'Automatic refunds',
    body: "If no SMS arrives inside the window, your balance is returned — no ticket, no waiting.",
  },
  {
    icon: 'api',
    title: 'Built for automation',
    body: 'A clean REST API with Bearer auth, idempotency keys, and polling for OTP delivery.',
  },
] as const;

export const PLATFORMS = [
  'WhatsApp',
  'Telegram',
  'Discord',
  'Signal',
  'TikTok',
  'Instagram',
  'Shopee',
  'Spotify',
  'Facebook',
  'Twitter',
  'Tinder',
  'Gmail',
  'GitHub',
  'OpenAI',
  'Amazon',
  'PayPal',
];

export const TESTIMONIALS = [
  {
    handle: '@nateliason',
    body: 'As a developer I needed a reliable way to receive SMS online for testing. No more juggling SIM cards — the virtual numbers here actually deliver.',
  },
  {
    handle: '@nathanclark_',
    body: 'Way cheaper than the alternatives, and the price per verification is very competitive. Success rate has been solid.',
  },
  {
    handle: '@coolidge95781',
    body: 'The REST API design is great — Bearer auth, JSON responses. Integration took me about 30 minutes.',
  },
  {
    handle: '@devsarah',
    body: 'Auto-refund on missed OTP is the feature that sold me. I never have to chase support for credits.',
  },
];

export const FAQ: QA[] = [
  {
    q: 'How does it work?',
    a: 'Top up a balance, choose a platform and country, and you are assigned a real number. Any SMS it receives shows up in your dashboard and via the API. If no SMS arrives inside the window, the order is refunded automatically.',
  },
  {
    q: 'How do I create an account?',
    a: 'Click “Get Started Free”, enter an email and password, and you are in. No credit card is required to sign up.',
  },
  {
    q: 'How do I add money?',
    a: `Navigate to Deposit in your dashboard, then:

1. Choose a payment method (bank transfer or crypto)
2. Enter the amount you'd like to deposit
3. Complete the payment through the provider

Funds are credited automatically once the payment is confirmed. Minimum deposit starts from $0.50.`,
  },
  {
    q: "What happens if I don't receive an OTP?",
    a: 'When the order window expires without a delivered SMS, the full amount is returned to your balance automatically. A delivered SMS is billable even if it contains no extractable code.',
  },
  {
    q: 'Can I get a refund?',
    a: 'Unused balance never expires and missed OTPs are auto-refunded. There are no subscriptions or recurring charges to cancel.',
  },
];
