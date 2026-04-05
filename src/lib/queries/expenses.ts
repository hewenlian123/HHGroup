import { getExpenses, getExpenseCategories, getWorkers, type Expense } from "@/lib/data";

/** TanStack Query cache key for the expenses list (normalized `Expense[]` from the data layer). */
export const expensesQueryKey = ["expenses"] as const;

export const expenseCategoriesQueryKey = ["expense_categories"] as const;

export const workersQueryKey = ["workers"] as const;

export async function fetchExpenses(): Promise<Expense[]> {
  return getExpenses();
}

export async function fetchExpenseCategories(): Promise<string[]> {
  return getExpenseCategories();
}

export async function fetchWorkers(): Promise<{ id: string; name: string }[]> {
  const rows = await getWorkers();
  return rows as { id: string; name: string }[];
}
