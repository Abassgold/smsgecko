/* Read-only: dump a user's balance + recent orders + transactions.
   npx tsx --env-file=.env scripts/inspect-orders.ts <email> */
import mongoose from 'mongoose';

const email = (process.argv[2] ?? '').toLowerCase().trim();
if (!email) { console.error('pass an email'); process.exit(1); }
await mongoose.connect(process.env.MONGODB_URI!);
const db = mongoose.connection.db!;
console.log('db:', mongoose.connection.name);

const user = await db.collection('users').findOne({ email });
if (!user) { console.log('no such user'); process.exit(0); }
console.log('\nuser', {
  _id: String(user._id),
  email: user.email,
  balanceMicro: user.balanceMicro,
  balanceUSD: (user.balanceMicro ?? 0) / 1e6,
});

const orders = await db
  .collection('orders')
  .find({ userId: user._id })
  .sort({ createdAt: -1 })
  .limit(8)
  .toArray();
console.log(`\norders (${orders.length}):`);
for (const o of orders) {
  console.log(' ', {
    _id: String(o._id),
    status: o.status,
    provider: o.provider,
    priceMicro: o.priceMicro,
    priceUSD: (o.priceMicro ?? 0) / 1e6,
    otpCode: o.otpCode,
    idempotencyKey: o.idempotencyKey ?? null,
    createdAt: o.createdAt,
  });
}

const txns = await db
  .collection('transactions')
  .find({ userId: user._id })
  .sort({ createdAt: -1 })
  .limit(12)
  .toArray();
console.log(`\ntransactions (${txns.length}):`);
for (const t of txns) {
  console.log(' ', {
    type: t.type,
    amountMicro: t.amountMicro,
    amountUSD: (t.amountMicro ?? 0) / 1e6,
    balanceAfterMicro: t.balanceAfterMicro,
    description: t.description,
    orderId: t.orderId ? String(t.orderId) : null,
    createdAt: t.createdAt,
  });
}

await mongoose.disconnect();
