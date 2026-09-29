import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";

/** Route shell for the expense ledger while the capped server read is in flight. */
export default function LoadingExpenses() {
  return (
    <div className="expenses-ui">
      <div className="expenses-ui-content expenses-page-shell">
        <ExpensesListSkeleton rows={6} showStatCards mode="ledger" />
      </div>
    </div>
  );
}
