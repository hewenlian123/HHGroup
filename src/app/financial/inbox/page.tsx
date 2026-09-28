import { ExpenseWorkspacePage } from "../expenses/expense-workspace-page";
export const dynamic = "force-dynamic";
export default function InboxPage() {
  return <ExpenseWorkspacePage pool="inbox" />;
}
