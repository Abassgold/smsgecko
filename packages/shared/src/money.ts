/**
 * Money is represented everywhere as an integer number of **micro-USD**
 * (millionths of a dollar). Prices go well below one cent (e.g. $0.004),
 * so cents are not granular enough.
 *
 *   $1.00   -> 1_000_000 micro
 *   $0.004  ->     4_000 micro
 */

export const MICRO_PER_USD = 1_000_000;

/** Convert a USD amount (float, e.g. 6.38) to integer micro-USD. */
export function usdToMicro(usd: number): number {
  return Math.round(usd * MICRO_PER_USD);
}

/** Convert integer micro-USD to a USD number (may have float imprecision — display only). */
export function microToUsd(micro: number): number {
  return micro / MICRO_PER_USD;
}

/** Parse a user-entered string like "10", "$10.50", "0.004" to integer micro-USD. */
export function parseUsd(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '').trim();
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return NaN;
  return usdToMicro(value);
}

export interface FormatUsdOptions {
  /** Always render a leading "$". Default true. */
  symbol?: boolean;
  /** Minimum fraction digits. Default 2. */
  minDecimals?: number;
  /** Maximum fraction digits. Default 6. */
  maxDecimals?: number;
}

/**
 * Format integer micro-USD for display.
 *   6_380_000 -> "$6.38"
 *       4_000 -> "$0.004"
 *   1_000_000 -> "$1.00"
 */
export function formatUsd(micro: number, options: FormatUsdOptions = {}): string {
  const { symbol = true, minDecimals = 2, maxDecimals = 6 } = options;
  const negative = micro < 0;
  const usd = Math.abs(micro) / MICRO_PER_USD;

  const fixed = usd.toFixed(maxDecimals);
  const dot = fixed.indexOf('.');
  const whole = dot === -1 ? fixed : fixed.slice(0, dot);
  const rawFrac = dot === -1 ? '' : fixed.slice(dot + 1);
  // Trim trailing zeros but keep at least `minDecimals` decimal places.
  const trimmedFrac = rawFrac.replace(/0+$/, '').padEnd(minDecimals, '0').slice(0, maxDecimals);
  const str = trimmedFrac.length > 0 ? `${whole}.${trimmedFrac}` : whole;

  return `${negative ? '-' : ''}${symbol ? '$' : ''}${str}`;
}

/**
 * Balance display: the "≈" prefix the dashboard uses, rounded to cents.
 * (Prices keep sub-cent precision; a wallet balance does not.)
 */
export function formatApproxUsd(micro: number, options?: FormatUsdOptions): string {
  return `≈ ${formatUsd(micro, { minDecimals: 2, maxDecimals: 2, ...options })}`;
}

/** Signed display for ledger rows: "+$0.26" / "-$0.26". */
export function formatSignedUsd(micro: number, options?: FormatUsdOptions): string {
  const sign = micro > 0 ? '+' : micro < 0 ? '-' : '';
  return `${sign}${formatUsd(Math.abs(micro), options)}`;
}
