import type { Expense } from "@/lib/data";

function parseExpenseDayStartMs(d: string | undefined): number | null {
  if (!d) return null;
  const t = Date.parse(String(d).slice(0, 10));
  return Number.isNaN(t) ? null : t;
}

/** Calendar-day distance (UTC dates from ISO strings). */
function calendarDaysApart(a: number | null, b: number | null): number {
  if (a == null || b == null) return 999;
  return Math.abs(a - b) / 86400000;
}

function inboxTextSimilar(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length > y.length ? x : y;
  if (shorter.length < 3) return false;
  return longer.includes(shorter);
}

/**
 * Lightweight duplicate hint: only compares against `loaded` (e.g. current page).
 * Same amount, date within ±1 calendar day, vendor or notes similar.
 */
export function expenseInboxPossibleDuplicateAmongLoaded(
  expense: Expense,
  loaded: Expense[],
  getTotal: (e: Expense) => number
): boolean {
  const amt = getTotal(expense);
  const d0 = parseExpenseDayStartMs(expense.date);
  const v0 = expense.vendorName ?? "";
  const n0 = expense.notes ?? "";

  for (const o of loaded) {
    if (o.id === expense.id) continue;
    if (Math.abs(getTotal(o) - amt) > 0.009) continue;
    if (calendarDaysApart(d0, parseExpenseDayStartMs(o.date)) > 1) continue;
    const v1 = o.vendorName ?? "";
    const n1 = o.notes ?? "";
    if (inboxTextSimilar(v0, v1) || inboxTextSimilar(n0, n1)) return true;
  }
  return false;
}
