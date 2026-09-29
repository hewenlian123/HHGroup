export type ExpenseSortField = "date" | "amount" | "vendor";
export type ExpenseSortOrder = "asc" | "desc";
export type ExpenseListSort = { field: ExpenseSortField; order: ExpenseSortOrder };

export const defaultExpenseListSort: ExpenseListSort = {
  field: "date",
  order: "desc",
};

/** Default page for the expense ledger and receipt inbox. OCR pending rows are merged in addition to this cap. */
export const EXPENSE_LIST_PAGE_SIZE = 50;

export function isDefaultExpenseListSort(sort: ExpenseListSort): boolean {
  return sort.field === "date" && sort.order === "desc";
}

/** Canonical expense amount: sum the persisted expense lines without header fallback. */
export function getExpenseTotal(expense: { lines: ReadonlyArray<{ amount: number }> }): number {
  return expense.lines.reduce((sum, line) => sum + line.amount, 0);
}
