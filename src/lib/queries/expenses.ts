import type { Expense } from "@/lib/expenses-db";
import type { SubcontractDeductionOption } from "@/lib/subcontract-deductions-db";
import { defaultExpenseListSort, type ExpenseListSort } from "@/lib/expense-domain";
import type { PaymentAccountRow } from "@/lib/payment-accounts-db";

export type { ExpenseListSort };

export type ExpensesInitialData = {
  sort: ExpenseListSort;
  expenses: Expense[];
  categories: string[];
  workers: { id: string; name: string }[];
  subcontractDeductionOptions: SubcontractDeductionOption[];
  projects: { id: string; name: string | null; status?: string | null }[];
  paymentAccounts: PaymentAccountRow[];
};

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
  const { getExpenses } = await import("@/lib/data");
  return getExpenses(sort, { includeLinkedBankTx: false });
}

export const expenseCategoriesQueryKey = ["expense_categories"] as const;

export const workersQueryKey = ["workers"] as const;

export const subcontractDeductionOptionsQueryKey = ["subcontract_deduction_options"] as const;

export async function fetchExpenseCategories(): Promise<string[]> {
  const { getExpenseCategories } = await import("@/lib/data");
  return getExpenseCategories();
}

export async function fetchWorkers(): Promise<{ id: string; name: string }[]> {
  const { getWorkers } = await import("@/lib/data");
  const rows = await getWorkers();
  return rows as { id: string; name: string }[];
}

export async function fetchSubcontractDeductionOptions(): Promise<SubcontractDeductionOption[]> {
  const { getSubcontractDeductionOptions } = await import("@/lib/data");
  return getSubcontractDeductionOptions();
}

export { defaultExpenseListSort };
