import type { ClientSession, Types } from 'mongoose';
import type { TransactionType } from '@smsgecko/shared';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { paymentRequired, notFound } from './errors.js';

export interface LedgerContext {
  type: TransactionType;
  description: string;
  orderId?: Types.ObjectId | string | null;
  depositId?: Types.ObjectId | string | null;
  session?: ClientSession;
}

type UserId = Types.ObjectId | string;

/**
 * The ONLY place `User.balanceMicro` is mutated. Every call writes a paired
 * append-only `Transaction` row recording the signed amount and resulting balance.
 */
export async function credit(
  userId: UserId,
  amountMicro: number,
  ctx: LedgerContext,
): Promise<number> {
  assertPositive(amountMicro);
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { balanceMicro: amountMicro } },
    { returnDocument: 'after', session: ctx.session ?? undefined },
  );
  if (!user) throw notFound('User not found');
  await writeEntry(userId, amountMicro, user.balanceMicro, ctx);
  return user.balanceMicro;
}

export async function debit(
  userId: UserId,
  amountMicro: number,
  ctx: LedgerContext,
): Promise<number> {
  assertPositive(amountMicro);
  // Atomic guarded decrement — fails (returns null) if the balance is too low.
  const user = await User.findOneAndUpdate(
    { _id: userId, balanceMicro: { $gte: amountMicro } },
    { $inc: { balanceMicro: -amountMicro } },
    { returnDocument: 'after', session: ctx.session ?? undefined },
  );
  if (!user) {
    const exists = ctx.session
      ? await User.exists({ _id: userId }).session(ctx.session)
      : await User.exists({ _id: userId });
    throw exists ? paymentRequired() : notFound('User not found');
  }
  await writeEntry(userId, -amountMicro, user.balanceMicro, ctx);
  return user.balanceMicro;
}

async function writeEntry(
  userId: UserId,
  signedAmount: number,
  balanceAfter: number,
  ctx: LedgerContext,
): Promise<void> {
  await Transaction.create(
    [
      {
        userId,
        type: ctx.type,
        amountMicro: signedAmount,
        balanceAfterMicro: balanceAfter,
        description: ctx.description,
        orderId: ctx.orderId ?? null,
        depositId: ctx.depositId ?? null,
      },
    ],
    { session: ctx.session ?? undefined },
  );
}

function assertPositive(amountMicro: number): void {
  if (!Number.isInteger(amountMicro) || amountMicro <= 0) {
    throw new Error(`ledger amount must be a positive integer micro-USD, got ${amountMicro}`);
  }
}
