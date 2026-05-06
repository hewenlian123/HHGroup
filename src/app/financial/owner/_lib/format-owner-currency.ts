/**
 * Display-only currency helpers for /financial/owner (does not change ledger math).
 */

/** Full-precision USD for tooltips and titles. */
export function fmtUsdFull(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Signed full-precision USD. */
export function fmtUsdSignedFull(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return fmtUsdFull(0);
  const neg = n < 0;
  return `${neg ? "−" : ""}${fmtUsdFull(Math.abs(n))}`;
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
  if (x >= 1_000_000_000) core = `$${(x / 1_000_000_000).toFixed(1)}B`;
  else if (x >= 1_000_000) core = `$${(x / 1_000_000).toFixed(1)}M`;
  else if (x >= 1000) core = `$${(x / 1000).toFixed(1)}K`;
  else core = fmtUsdFull(x);
  return `${neg ? "−" : ""}${core}`;
}

/** Y-axis / chart ticks — same scale rules, unsigned. */
export function fmtUsdAxis(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const x = Math.abs(n);
  if (x >= 1_000_000_000) return `$${(x / 1_000_000_000).toFixed(1)}B`;
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(1)}M`;
  if (x >= 1000) return `$${(x / 1000).toFixed(1)}K`;
  return `$${Math.round(x)}`;
}
