import { roundEstimateCurrencyValue } from "./estimate-currency";

/** Clamp UI helper percent to 0–100. */
export function clampPaymentPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Estimate totals in this editor are dollars (not cents). */
export function paymentAmountFromPercent(percent: number, estimateTotalDollars: number): number {
  if (estimateTotalDollars <= 0 || !Number.isFinite(percent)) return 0;
  return roundEstimateCurrencyValue((estimateTotalDollars * clampPaymentPercent(percent)) / 100);
}

/** Reverse-calc percent for display; at most 2 decimal places. */
export function paymentPercentFromAmount(
  amountDollars: number,
  estimateTotalDollars: number
): string {
  if (estimateTotalDollars <= 0 || !Number.isFinite(amountDollars)) return "";
  const pct = (amountDollars / estimateTotalDollars) * 100;
  if (!Number.isFinite(pct)) return "";
  const rounded = Math.round((pct + Number.EPSILON) * 100) / 100;
  return String(rounded);
}

export function parsePaymentPercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return clampPaymentPercent(n);
}
