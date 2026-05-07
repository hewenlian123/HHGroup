import { formatCompactCurrency, formatCurrency } from "@/lib/formatters";

/**
 * Display-only currency helpers for /financial/owner (does not change ledger math).
 */

/** Full-precision USD for tooltips and titles. */
export function fmtUsdFull(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return formatCurrency(Math.abs(n));
}

/** Signed full-precision USD. */
export function fmtUsdSignedFull(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return fmtUsdFull(0);
  const neg = n < 0;
  return `${neg ? "-" : ""}${fmtUsdFull(Math.abs(n))}`;
}

/**
 * Compact USD for dense UI: $1.2M, $241.7K, small amounts stay fully formatted.
 */
export function fmtUsdAdaptive(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return fmtUsdFull(0);
  const neg = n < 0;
  const x = Math.abs(n);
  let core: string;
  if (x >= 1000) core = formatCompactCurrency(x);
  else core = fmtUsdFull(x);
  return `${neg ? "-" : ""}${core}`;
}

/** Y-axis / chart ticks — same scale rules, unsigned. */
export function fmtUsdAxis(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const x = Math.abs(n);
  if (x >= 1000) return formatCompactCurrency(x);
  return `$${Math.round(x)}`;
}
