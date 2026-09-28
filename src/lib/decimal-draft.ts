/**
 * Decimal text drafts for money and tax fields.
 * The field keeps intermediate text such as "" and "4." so typing is not
 * replaced by a coerced number on each keystroke.
 */

const PARTIAL_DECIMAL = /^\d*\.?\d*$/;

export function nextDecimalDraft(current: string, raw: string): string {
  if (raw === "" || PARTIAL_DECIMAL.test(raw)) return raw;
  return current;
}

export function parseDecimalDraft(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === ".") return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function decimalDraftFromNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}
