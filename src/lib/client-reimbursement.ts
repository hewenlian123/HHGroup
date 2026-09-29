import { expenseCountsTowardCanonicalProjectCost } from "@/lib/expense-canonical-cost";
import { roundMoney } from "@/lib/money";

export const CLIENT_REIMBURSEMENT_STATUSES = ["not_requested", "requested", "reimbursed"] as const;

export type ClientReimbursementStatus = (typeof CLIENT_REIMBURSEMENT_STATUSES)[number];

export type ClientReimbursementLine = {
  clientReimbursable?: boolean | null;
  clientReimbursementStatus?: string | null;
  amount?: number | null;
  expenseStatus?: string | null;
  referenceNo?: string | null;
  inboxCapture?: boolean | null;
};

/**
 * Client reimbursement is not a second cost source.
 * Approved reimbursable lines stay inside canonical expense cost.
 * Outstanding is the amount the client still owes. It is not subtracted from
 * cost and not added to revenue. When the client pays, that customer payment
 * is the recovery. Removing the expense as well would count the recovery twice.
 */
export function clientReimbursementStatusOf(
  line: ClientReimbursementLine
): ClientReimbursementStatus | null {
  if (line.clientReimbursable !== true) return null;
  const status = String(line.clientReimbursementStatus ?? "not_requested")
    .trim()
    .toLowerCase();
  if (status === "requested" || status === "reimbursed" || status === "not_requested") {
    return status;
  }
  return "not_requested";
}

export function clientReimbursementOutstandingAmount(line: ClientReimbursementLine): number {
  const status = clientReimbursementStatusOf(line);
  if (status !== "not_requested" && status !== "requested") return 0;
  return roundMoney(line.amount ?? 0);
}

export function reimbursableOutstandingInJobCost(lines: ClientReimbursementLine[]): number {
  return roundMoney(
    lines.reduce((sum, line) => {
      if (
        !expenseCountsTowardCanonicalProjectCost({
          status: line.expenseStatus,
          reference_no: line.referenceNo,
          inbox_capture: line.inboxCapture,
        })
      ) {
        return sum;
      }
      return sum + clientReimbursementOutstandingAmount(line);
    }, 0)
  );
}

/** Job cost is unchanged by reimbursement status. Outstanding is reported beside it. */
export function jobCostWithClientReimbursement(input: {
  expenseCost: number;
  lines: ClientReimbursementLine[];
}): { expenseCost: number; reimbursableOutstanding: number } {
  return {
    expenseCost: roundMoney(input.expenseCost),
    reimbursableOutstanding: reimbursableOutstandingInJobCost(input.lines),
  };
}

export function clientReimbursementStatusLabel(status: ClientReimbursementStatus | null): string {
  if (status === "requested") return "Requested";
  if (status === "reimbursed") return "Reimbursed";
  if (status === "not_requested") return "Not requested";
  return "Not reimbursable";
}

export function reimbursementRequestLinesAreCompatible(
  lines: Array<{ projectId?: string | null; status?: ClientReimbursementStatus | null }>
): string | null {
  if (lines.length === 0) return "Choose at least one expense.";
  const projectIds = new Set(lines.map((line) => line.projectId || ""));
  if (projectIds.size !== 1 || projectIds.has("")) {
    return "A reimbursement request can include only one project.";
  }
  if (lines.some((line) => line.status === "reimbursed" || line.status === "requested")) {
    return "Requested and reimbursed expenses are not included in a new request.";
  }
  if (lines.some((line) => line.status !== "not_requested")) {
    return "Only client-reimbursable expenses can be requested.";
  }
  return null;
}
