import { defaultExpenseListSort, type ExpenseListSort } from "@/lib/expenses-db";

export const EXPENSE_SORT_STORAGE_KEY = "hh-expenses-sort-v1";

export function readStoredExpenseSort(): ExpenseListSort {
  if (typeof window === "undefined") return defaultExpenseListSort;
  try {
    const raw = localStorage.getItem(EXPENSE_SORT_STORAGE_KEY);
    if (!raw) return defaultExpenseListSort;
    const p = JSON.parse(raw) as Partial<ExpenseListSort>;
    if (
      (p.field === "date" || p.field === "amount" || p.field === "vendor") &&
      (p.order === "asc" || p.order === "desc")
    ) {
      return { field: p.field, order: p.order };
    }
  } catch {
    /* ignore */
  }
  return defaultExpenseListSort;
}
