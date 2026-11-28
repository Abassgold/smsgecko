export interface Post { slug: string; title: string; date: string; excerpt: string; body: string[] }

/** Developer guides. Plain paragraphs, rendered on the server so search engines index them. */
export const POSTS: Post[] = [
  {
    slug: 'sms-verification-api-guide',
    title: 'SMS verification API: how to receive OTP codes from code',
    date: '2026-11-28',
    excerpt: 'What an SMS verification API does, the three calls you need, and how to avoid paying for codes that never arrive.',
    body: [
      'An SMS verification API lets your software do what a person does on the SMSGecko website: rent a phone number for a service such as WhatsApp or Telegram, wait for the one-time code (OTP), and close the order. Bots, account tools and reseller sites use it to verify accounts without anyone clicking through a dashboard.',
      'With the SMS-Activate-compatible endpoint you need three calls. getNumber rents a number and returns an activation id and the phone number. getStatus, called every few seconds, returns STATUS_WAIT_CODE until the SMS arrives and then STATUS_OK followed by the code. setStatus closes the activation: 6 when you are done, 3 to ask for another SMS, or 8 to cancel and get your money back.',
      'Starting fresh? The REST API under /api/v2 does the same with JSON responses, Bearer authentication and idempotency keys, so a retried request never buys twice.',
      'Instead of polling, set an HTTPS webhook. SMSGecko then POSTs each code to your server as it arrives, signed with HMAC-SHA256 in the X-SMSGecko-Signature header, and retries deliveries your server does not accept.',
      'Cost control matters at volume: pass maxPrice to cap what a number may cost, or buy an exact price tier from getPricesV2. If no SMS arrives inside the order window, the order is refunded to your balance automatically. See smsgecko.com/sms-api for ready-to-run examples.',
    ],
  },
  {
    slug: 'switch-from-sms-activate-api',
    title: 'Switching from the SMS-Activate API: change the host, keep your code',
    date: '2026-11-28',
    excerpt: 'SMSGecko speaks the same handler_api.php protocol, so most tools move over in minutes. Here is the checklist.',
    body: [
      'Many bots, reseller panels and automation tools were written for the SMS-Activate request format: one handler_api.php endpoint with an action parameter such as getNumber or getStatus. SMSGecko supports that format for its core methods, so moving a tool usually means changing only the host and the API key.',
      'The checklist: create an SMSGecko account and add funds; copy your API key from Settings; replace your previous provider host with www.smsgecko.com, keeping the /stubs/handler_api.php path; paste the new key; run one test order with a cheap service to confirm everything works end to end.',
      'Supported methods are getBalance, getNumber, getNumberV2, getStatus, getStatusV2, setStatus, getActiveActivations, getPrices, getPricesV2, getServicesList and getCountries. Common service codes such as wa, tg and go and numeric country ids work as expected.',
      'After switching you also get signed webhooks and automatic refunds when a number receives no SMS. If your tool relies on a method not listed above, contact us and tell us which one.',
      'SMSGecko is an independent service and is not affiliated with SMS-Activate. The full migration guide is at smsgecko.com/sms-activate-alternative.',
    ],
  },
  {
    slug: 'run-an-otp-reseller-bot-on-an-sms-api',
    title: 'Run an OTP reseller bot or website on top of an SMS API',
    date: '2026-11-28',
    excerpt: 'How resellers use the SMSGecko API to sell virtual numbers through their own Telegram bot or site.',
    body: [
      'A common way to build a numbers business is to resell: your customers pay you, and your bot or website buys the number from an API like SMSGecko in the background. You keep the difference between your price and ours, without managing SIM cards or providers yourself.',
      'When a customer picks a service and country, call getPrices to show them a price, then getNumber to rent the number. Show them the phone number and, as soon as the code arrives (by polling getStatus or through your webhook), pass it on in the chat or on your page.',
      'Protect your margin: always pass maxPrice so a price change never makes you sell at a loss, and cancel with setStatus 8 when a customer gives up so the number is refunded to your balance. Numbers that receive nothing are refunded automatically when their window closes.',
      'Keep one SMSGecko balance for all your customers and top it up in bulk. Every order your bot makes also appears in your SMSGecko order history, which makes support questions easy to check.',
      'Ready to build? smsgecko.com/sms-api has code examples for both the SMS-Activate-compatible endpoint and the REST API.',
    ],
  },
];
