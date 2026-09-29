import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";

/** Route shell for the receipt inbox. OCR pending rows are included in the server read that follows. */
export default function LoadingInbox() {
  return (
    <div className="expenses-ui">
      <div className="expenses-ui-content expenses-page-shell">
        <ExpensesListSkeleton rows={6} mode="default" />
      </div>
    </div>
  );
}
