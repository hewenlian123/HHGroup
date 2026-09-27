import { ReimbursementBalances } from "./reimbursement-balances";

/** Legacy route retained as a deprecate candidate; the same report lives in Labor Reimbursements. */
export default function FinancialWorkersPage() {
  return <ReimbursementBalances legacy />;
}
