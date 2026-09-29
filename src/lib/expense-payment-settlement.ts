export type ExpenseSettlement = "unpaid" | "paid";

export type ExpenseSettlementInput = {
  paymentStatus?: string | null;
  paymentAccountId?: string | null;
  workflowStatus?: string | null;
};

const APPROVED_WORKFLOW = new Set([
  "approved",
  "reviewed",
  "done",
  "completed",
  "paid",
  "reimbursed",
  "reimbursable",
]);

export function normalizeExpenseSettlement(
  value: string | null | undefined
): ExpenseSettlement | null {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  if (status === "unpaid" || status === "paid") return status;
  return null;
}

/**
 * Stored payment_status wins. Legacy rows with no column value stay visible:
 * an account means paid, an approved expense without one means unpaid.
 * This does not write those rows.
 */
export function expenseSettlementOf(input: ExpenseSettlementInput): ExpenseSettlement | null {
  const stored = normalizeExpenseSettlement(input.paymentStatus);
  if (stored) return stored;
  const workflow = String(input.workflowStatus ?? "")
    .trim()
    .toLowerCase();
  if (!APPROVED_WORKFLOW.has(workflow)) return null;
  return String(input.paymentAccountId ?? "").trim() ? "paid" : "unpaid";
}

export function expenseSettlementLabel(input: ExpenseSettlementInput): "Paid" | "Unpaid" | null {
  const settlement = expenseSettlementOf(input);
  if (settlement === "paid") return "Paid";
  if (settlement === "unpaid") return "Unpaid";
  return null;
}

export function expenseMatchesSettlementFilter(
  input: ExpenseSettlementInput,
  filter: string | null | undefined
): boolean {
  const wanted = String(filter ?? "")
    .trim()
    .toLowerCase();
  if (!wanted || wanted === "all") return true;
  return expenseSettlementOf(input) === wanted;
}

export function settlementForApproval(input: {
  paymentAccountId?: string | null;
  settlement?: string | null;
}): ExpenseSettlement {
  const requested = normalizeExpenseSettlement(input.settlement);
  if (requested) return requested;
  return String(input.paymentAccountId ?? "").trim() ? "paid" : "unpaid";
}
