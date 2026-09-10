/* End-to-end buy flow against the RUNNING api (:4000) + DB, live catalog.
   npx tsx --env-file=.env scripts/test-buy-flow.ts */
import mongoose from 'mongoose';

const API = 'http://localhost:4000';
const SERVICE = 'whatsapp';
const COUNTRY = 'us';
const FUND_MICRO = 10_000_000; // $10.00

const usd = (m: number) => `$${(m / 1e6).toFixed(2)}`;
const step = (s: string) => console.log(`\n── ${s}`);

await mongoose.connect(process.env.MONGODB_URI!);
const db = mongoose.connection.db!;

// 1. quote the live catalog (active provider)
step('quote');
const q = await (await fetch(`${API}/api/v1/catalog/quote?serviceId=${SERVICE}&countryId=${COUNTRY}`)).json();
if (!q.available) throw new Error(`no ${SERVICE}/${COUNTRY} offer: ${JSON.stringify(q)}`);
console.log(`  ${SERVICE}/${COUNTRY} → ${usd(q.bestOffer.priceMicro)}  stock ${q.bestOffer.stock}`);
const expectPrice = q.bestOffer.priceMicro;

// 2. a fresh verified, funded user
step('user');
const email = `buyflow.${Date.now()}@test.dev`;
const reg = await fetch(`${API}/api/v1/auth/register`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, username: `bf${Date.now().toString().slice(-8)}`, password: 'password123' }),
});
const regBody = await reg.json();
if (!reg.ok) throw new Error(`register failed ${reg.status}: ${JSON.stringify(regBody)}`);
const cookie = (reg.headers.get('set-cookie') ?? '')
  .split(/,(?=\s*smsg_)/).map((c) => c.split(';')[0].trim()).join('; ');
const userId = new mongoose.Types.ObjectId(regBody.user.id);
await db.collection('users').updateOne({ _id: userId }, { $set: { isVerified: true, balanceMicro: FUND_MICRO } });
console.log(`  ${email}  funded ${usd(FUND_MICRO)}, verified`);

const bal = async () => (await db.collection('users').findOne({ _id: userId }))!.balanceMicro as number;
console.log(`  balance before: ${usd(await bal())}`);

// 3. buy
step('POST /api/v1/orders');
const buy = await fetch(`${API}/api/v1/orders`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ serviceId: SERVICE, countryId: COUNTRY }),
});
const order = await buy.json();
if (!buy.ok) throw new Error(`buy failed ${buy.status}: ${JSON.stringify(order)}`);
console.log(`  ${buy.status}  order=${order.id} status=${order.status} phone=${order.phoneNumber} price=${usd(order.priceMicro)}`);

// 4. debit check
step('debit check');
const afterBuy = await bal();
console.log(`  balance after buy: ${usd(afterBuy)}  (expected ${usd(FUND_MICRO - order.priceMicro)})`);
const txns = await db.collection('transactions').find({ userId }).sort({ createdAt: -1 }).limit(2).toArray();
for (const t of txns) console.log(`    txn ${t.type} ${usd(t.amountMicro)}  bal ${usd(t.balanceBeforeMicro)} → ${usd(t.balanceAfterMicro)}  orderId=${t.orderId ? String(t.orderId) : null}`);
console.log(`  ${afterBuy === FUND_MICRO - order.priceMicro ? 'PASS' : 'FAIL'} — debited the quoted price`);
console.log(`  ${order.priceMicro === expectPrice ? 'PASS' : 'note'} — order price matches the quote (${usd(expectPrice)})`);

// 5. force + fetch the OTP
step('deliver OTP');
await db.collection('orders').updateOne(
  { _id: new mongoose.Types.ObjectId(order.id) }, { $set: { deliverAt: new Date(0) } },
);
let final: any;
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  final = await (await fetch(`${API}/api/v1/orders/${order.id}`, { headers: { cookie } })).json();
  if (final.status !== 'waiting') break;
  process.stdout.write('.');
}
console.log(`\n  order=${final.status} otp=${final.otpCode ?? '—'} messages=${final.messages?.length ?? 0}`);

step('post-delivery balance');
const afterOtp = await bal();
console.log(`  balance: ${usd(afterOtp)}  ${afterOtp === afterBuy ? 'PASS — unchanged (charge was at purchase)' : 'FAIL'}`);

await mongoose.disconnect();
