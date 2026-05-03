import { getExpenses, getExpenseCategories, getWorkers, type Expense } from "@/lib/data";
import { defaultExpenseListSort, type ExpenseListSort } from "@/lib/expenses-db";

export type { ExpenseListSort };

/** Shared stale window for expenses list + prefetch — reduces hover→nav duplicate refetches. */
export const expenseListQueryStaleMs = 120_000;

/** Prefix for invalidating every expenses list query (any sort). */
export const expensesQueryKeyRoot = ["expenses"] as const;

/** @deprecated Prefer expensesQueryKeyRoot for invalidation; kept for older imports. */
export const expensesQueryKey = expensesQueryKeyRoot;

export function buildExpensesQueryKey(sort: ExpenseListSort) {
  return [...expensesQueryKeyRoot, sort.field, sort.order] as const;
}

export async function fetchExpenses(
  sort: ExpenseListSort = defaultExpenseListSort
): Promise<Expense[]> {
  return getExpenses(sort);
}

export const expenseCategoriesQueryKey = ["expense_categories"] as const;

export const workersQueryKey = ["workers"] as const;

export async function fetchExpenseCategories(): Promise<string[]> {
  return getExpenseCategories();
}

export async function fetchWorkers(): Promise<{ id: string; name: string }[]> {
  const rows = await getWorkers();
  return rows as { id: string; name: string }[];
}

export { defaultExpenseListSort };
