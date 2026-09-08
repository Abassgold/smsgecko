import { Badge } from '@/components/ui/badge';
import type { OrderStatus } from '@smsgecko/shared';

const MAP: Record<OrderStatus, { tone: 'success' | 'danger' | 'warning' | 'default'; label: string }> = {
  waiting: { tone: 'warning', label: 'Waiting' },
  completed: { tone: 'success', label: 'Completed' },
  canceled: { tone: 'danger', label: 'Canceled' },
  expired: { tone: 'danger', label: 'Canceled' }, // live site shows timeouts as "Canceled"
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { tone, label } = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
