type DateVariant = "table" | "compact" | "month";

function finiteNumber(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  compactDisplay: "short",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("en-US");

const tableDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const monthDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

export function formatCurrency(value: number | null | undefined): string {
  const n = finiteNumber(value);
  if (n == null) return "—";
  return currencyFormatter.format(n);
}

export function formatCompactCurrency(value: number | null | undefined): string {
  const n = finiteNumber(value);
  if (n == null) return "—";
  return compactCurrencyFormatter.format(n);
}

export function formatInteger(value: number | null | undefined): string {
  const n = finiteNumber(value);
  if (n == null) return "—";
  return integerFormatter.format(n);
}

export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {}
): string {
  const n = finiteNumber(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", options).format(n);
}

export function formatPercent(
  value: number | null | undefined,
  options: number | { maximumFractionDigits?: number } = 1
): string {
  const n = finiteNumber(value);
  if (n == null) return "—";
  const maximumFractionDigits =
    typeof options === "number" ? options : (options.maximumFractionDigits ?? 1);
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(n)}%`;
}

function parseDisplayDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;
  const ymd = raw.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (match) {
    const [, yy, mm, dd] = match;
    const date = new Date(Number(yy), Number(mm) - 1, Number(dd));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(
  value: string | Date | null | undefined,
  variant: DateVariant = "table"
) {
  const date = parseDisplayDate(value);
  if (!date) return "—";
  if (variant === "compact") return compactDateFormatter.format(date);
  if (variant === "month") return monthDateFormatter.format(date);
  return tableDateFormatter.format(date);
}

export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
  variant: DateVariant = "table"
): string {
  return `${formatDate(start, variant)} - ${formatDate(end, variant)}`;
}
