/**
 * Canonical accrued labor cost matches profit-engine: every labor entry counts
 * except paid settlements and voids. Draft and submitted time is real project
 * cost; there is no separate approval gate on Add Entry.
 */
export function laborEntryCountsTowardCanonicalCost(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  return normalized !== "paid" && normalized !== "void" && normalized !== "voided";
}
