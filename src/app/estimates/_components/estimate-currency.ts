import { formatCurrency } from "@/lib/formatters";

export function roundEstimateCurrencyValue(value: number | string | null | undefined): number {
  const normalized =
    typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.round((normalized + Number.EPSILON) * 100) / 100;
}

export function formatEstimateCurrency(value: number | string | null | undefined): string {
  if (value == null) return formatCurrency(value);
  const normalized =
    typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : Number(value);
  if (!Number.isFinite(normalized)) return formatCurrency(null);
  return formatCurrency(roundEstimateCurrencyValue(normalized));
}
