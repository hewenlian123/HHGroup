const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const warrantyDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function parseDateOnlyUtc(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function deriveWarrantyExpirationDateOnly(
  startDate: string,
  periodMonths: number
): string | null {
  const date = parseDateOnlyUtc(startDate);
  if (!date || !Number.isInteger(periodMonths) || periodMonths === 0) return null;

  date.setUTCMonth(date.getUTCMonth() + periodMonths);
  return date.toISOString().slice(0, 10);
}

export function formatWarrantyDateOnly(value: string): string | null {
  const date = parseDateOnlyUtc(value);
  return date ? warrantyDateFormatter.format(date) : null;
}
