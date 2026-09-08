import type { CodeTab } from '@/components/ui/code-block';
import type { QA } from '@/components/ui/accordion';

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

export const QUICK_START: CodeTab[] = [
  {
    label: 'TypeScript',
    language: 'ts',
    code: `import { SMSGeckoClient } from "@smsgecko/sdk";

const client = new SMSGeckoClient({ token: process.env.SMSGECKO_TOKEN! });

const order = await client.orders.create({
  catalog_product_id: process.env.SMSGECKO_CATALOG_PRODUCT_ID,
  max_price: "0.50",
});

const { otpCode } = await client.orders.waitForOtp(order.id, { timeoutMs: 120_000 });
console.log(otpCode);
await client.orders.finish(order.id);`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `from smsgecko import SMSGeckoClient

client = SMSGeckoClient(token=os.environ["SMSGECKO_TOKEN"])

order = client.orders.create(
    catalog_product_id=os.environ["SMSGECKO_CATALOG_PRODUCT_ID"],
    max_price="0.50",
)

otp = client.orders.wait_for_otp(order.id, timeout_ms=120_000)
print(otp.code)
client.orders.finish(order.id)`,
  },
  {
    label: 'REST',
    language: 'bash',
    code: `curl -X POST https://api.smsgecko.local/api/v2/orders \\
  -H "Authorization: Bearer $SMSGECKO_TOKEN" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"catalog_product_id":"'$ID'","max_price":"0.50"}'

curl https://api.smsgecko.local/api/v2/orders/$ORDER_ID \\
  -H "Authorization: Bearer $SMSGECKO_TOKEN"`,
  },
];

export const WHAT_IT_DOES = [
  {
    title: 'Live inventory',
    body: 'Every number has a price and stock count shown up front. No surprises at checkout.',
  },
  {
    title: 'Automatic refunds',
    body: "If no SMS arrives inside the window, your balance is returned — no ticket, no waiting.",
  },
  {
    title: 'Built for automation',
    body: 'A clean REST API with Bearer auth, idempotency keys, and polling for OTP delivery.',
  },
];

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
    body: 'The REST API design is great — Bearer auth, JSON responses. SDK integration took me about 30 minutes.',
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
    q: 'What payment methods do you accept?',
    a: 'This replica uses a mock payment provider plus a simulated crypto (USDT) flow. Deposits confirm instantly in development.',
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
