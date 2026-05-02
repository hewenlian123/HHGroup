/**
 * Single source of truth for which expense DB statuses count toward Project Cost / Spent.
 * Used by project cost bundle + dashboard (do not duplicate checks elsewhere).
 */
export function isConfirmedExpenseStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  return s === "done" || s === "reviewed" || s === "approved" || s === "paid";
}
