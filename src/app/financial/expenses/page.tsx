import { ExpenseWorkspacePage } from "./expense-workspace-page";
export const dynamic = "force-dynamic";
export default function ExpensesPage() {
  return <ExpenseWorkspacePage pool="expenses" />;
}
