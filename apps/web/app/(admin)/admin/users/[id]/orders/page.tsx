'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { OrdersTable } from '@/components/admin/orders-table';

export default function UserOrdersPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">User orders</h1>
        <Link href={`/admin/users/${id}`} className="text-sm text-accent">
          ← Back to user
        </Link>
      </div>
      <OrdersTable userId={id} />
    </div>
  );
}
