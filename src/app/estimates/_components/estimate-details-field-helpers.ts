/** Add calendar days to YYYY-MM-DD in local timezone (no UTC day shift). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dt = new Date(year, month, day);
  if (!Number.isFinite(dt.getTime())) return "";
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function safeMoneyAmount(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round((n + Number.EPSILON) * 100) / 100);
}

/** Discount field stores a dollar amount subtracted from grand total. */
export function discountAmountFromPercent(preDiscountTotal: number, percent: number): number {
  const base = Math.max(0, Number(preDiscountTotal) || 0);
  if (base <= 0) return 0;
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  if (!Number.isFinite(pct)) return 0;
  return safeMoneyAmount(base * (pct / 100));
}
