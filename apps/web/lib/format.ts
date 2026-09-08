export {
  formatUsd,
  formatApproxUsd,
  formatSignedUsd,
  microToUsd,
  usdToMicro,
  parseUsd,
} from '@smsgecko/shared';

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "Sep 5 16:30" — matches the orders table on the live site. */
export function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en', { month: 'short' });
  const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${month} ${d.getDate()} ${time}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTimeAgo(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) return RELATIVE.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, 'hour');
  return RELATIVE.format(Math.round(hours / 24), 'day');
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
