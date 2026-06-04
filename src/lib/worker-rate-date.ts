function ymdFromParts(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Effective date is invalid.");
  }
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function normalizeWorkerRateDate(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("Effective date is required.");

  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (ymd) return ymdFromParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return ymdFromParts(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));

  throw new Error("Effective date must be YYYY-MM-DD or MM/DD/YYYY.");
}

export function workerRateLocalYmd(
  date: Pick<Date, "getFullYear" | "getMonth" | "getDate"> = new Date()
): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
