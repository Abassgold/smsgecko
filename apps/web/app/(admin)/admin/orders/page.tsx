'use client';

import { OrdersTable } from '@/components/admin/orders-table';

export default function AdminOrdersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Orders</h1>
      <OrdersTable />
    </div>
  );
}
