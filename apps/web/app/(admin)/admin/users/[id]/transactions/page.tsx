'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TransactionsTable } from '@/components/admin/transactions-table';

export default function UserTransactionsPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">User transactions</h1>
        <Link href={`/admin/users/${id}`} className="text-sm text-accent">
          ← Back to user
        </Link>
      </div>
      <TransactionsTable userId={id} />
    </div>
  );
}
