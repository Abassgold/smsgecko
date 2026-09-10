/* Inspect (and with --delete, remove) a user by email from the configured DB.
   Usage:
     npx tsx scripts/purge-user.ts abasskola10@yahoo.com            # dry run: show what exists
     npx tsx scripts/purge-user.ts abasskola10@yahoo.com --delete   # delete user + their auth tokens
*/
import mongoose from 'mongoose';

const email = (process.argv[2] ?? '').toLowerCase().trim();
const doDelete = process.argv.includes('--delete');
if (!email) {
  console.error('pass an email');
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db!;
console.log('db:', mongoose.connection.name);

const user = await db.collection('users').findOne({ email });
if (!user) {
  console.log(`no user with email ${email} — nothing to do`);
  await mongoose.disconnect();
  process.exit(0);
}
console.log('\nuser:', {
  _id: user._id,
  email: user.email,
  username: user.username,
  role: user.role,
  status: user.status,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
});

const uid = user._id;
const related: Record<string, string> = {
  emailtokens: 'userId',
  refreshtokens: 'userId',
  orders: 'userId',
  transactions: 'userId',
  deposits: 'userId',
  notifications: 'userId',
  apikeys: 'userId',
};
console.log('\nrelated docs:');
for (const [coll, field] of Object.entries(related)) {
  const n = await db.collection(coll).countDocuments({ [field]: uid }).catch(() => -1);
  console.log(`  ${coll.padEnd(14)} ${n}`);
}

if (!doDelete) {
  console.log('\n(dry run — pass --delete to remove the user + emailtokens + refreshtokens)');
  await mongoose.disconnect();
  process.exit(0);
}

const delUser = await db.collection('users').deleteOne({ _id: uid });
const delTokens = await db.collection('emailtokens').deleteMany({ userId: uid });
const delRefresh = await db.collection('refreshtokens').deleteMany({ userId: uid });
console.log('\ndeleted:', {
  users: delUser.deletedCount,
  emailtokens: delTokens.deletedCount,
  refreshtokens: delRefresh.deletedCount,
});
console.log('orders/transactions/deposits/notifications left as-is (harmless orphans).');

await mongoose.disconnect();
