const NON_BLOCKING_LABOR_STATUSES = new Set([
  "cancelled",
  "canceled",
  "deleted",
  "hidden",
  "void",
  "voided",
]);

export function normalizedLaborStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isHiddenLaborEntryStatus(value: unknown): boolean {
  return NON_BLOCKING_LABOR_STATUSES.has(normalizedLaborStatus(value));
}

export function isDuplicateBlockingLaborEntryStatus(value: unknown): boolean {
  return !isHiddenLaborEntryStatus(value);
}
