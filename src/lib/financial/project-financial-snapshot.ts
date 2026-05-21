export type ProjectFinancialWarningSeverity = "info" | "warning";

export type ProjectFinancialWarning = {
  code: string;
  severity: ProjectFinancialWarningSeverity;
  message: string;
  sourceId?: string;
};

export type ProjectFinancialSnapshotDiagnostics = {
  expenseLinesLoaded: number;
  expenseHeaderFallbackCount: number;
  excludedExpenseCount: number;
  pendingExpenseCost: number;
  pendingExpenseCount: number;
  changeOrdersLoaded: number;
  approvedChangeOrdersCount: number;
  reimbursementDedupedCount: number;
  pendingReimbursementCost: number;
  pendingReimbursementCount: number;
  committedReimbursementCost: number;
  committedReimbursementCount: number;
  subcontractCashOut: number;
  openSubcontractAP: number;
  openAP: number;
  apCashOut: number;
  apBillCount: number;
  apDiagnosticsWarnings: string[];
  missingSchemaWarnings: string[];
  pendingCostReviewWarnings: string[];
};

export type ProjectFinancialAmountRow = {
  id?: string | null;
  amount?: number | string | null;
  total?: number | string | null;
  totalAmount?: number | string | null;
  total_amount?: number | string | null;
  costAmount?: number | string | null;
  cost_amount?: number | string | null;
  status?: string | null;
};

export type ProjectFinancialInvoicePaymentInput = ProjectFinancialAmountRow;

export type ProjectFinancialInvoiceInput = ProjectFinancialAmountRow & {
  payments?: ProjectFinancialInvoicePaymentInput[];
  paidAmount?: number | string | null;
};

export type ProjectFinancialExpenseLineInput = ProjectFinancialAmountRow & {
  expenseId?: string | null;
  referenceNo?: string | null;
  source?: string | null;
  sourceId?: string | null;
  linkedReimbursementId?: string | null;
  category?: string | null;
};

export type ProjectFinancialLaborEntryInput = ProjectFinancialAmountRow & {
  workerPaymentId?: string | null;
};

export type ProjectFinancialReimbursementInput = ProjectFinancialAmountRow & {
  convertedExpenseId?: string | null;
  sourceExpenseId?: string | null;
};

export type ProjectFinancialSnapshotInput = {
  projectId: string;
  contractValue?: number | string | null;
  approvedChangeOrders?: number | string | null;
  invoices?: ProjectFinancialInvoiceInput[];
  expenseLines?: ProjectFinancialExpenseLineInput[];
  laborEntries?: ProjectFinancialLaborEntryInput[];
  workerReimbursements?: ProjectFinancialReimbursementInput[];
  subcontractCosts?: ProjectFinancialAmountRow[];
  apCosts?: ProjectFinancialAmountRow[];
  cashOutPayments?: ProjectFinancialAmountRow[];
};

export type ExpenseProjectCostStatusDecision = {
  status: string;
  included: boolean;
  reason: string;
  warningCode?: string;
};

export type ProjectFinancialSnapshot = {
  projectId: string;
  contractValue: number;
  approvedChangeOrders: number;
  revisedContractValue: number;
  billedAmount: number;
  paidAmount: number;
  openAR: number;
  actualCost: number;
  expenseCost: number;
  laborCost: number;
  reimbursementCost: number;
  subcontractCost: number;
  apCost: number;
  grossProfit: number;
  grossMargin: number;
  cashCollected: number;
  cashOut: number;
  cashPosition: number;
  warnings: ProjectFinancialWarning[];
  diagnostics?: ProjectFinancialSnapshotDiagnostics;
};

const INCLUDED_PROJECT_EXPENSE_COST_STATUSES = new Set([
  "approved",
  "completed",
  "done",
  "paid",
  "reviewed",
]);

const EXCLUDED_PROJECT_EXPENSE_COST_STATUSES = new Set([
  "cancelled",
  "canceled",
  "draft",
  "rejected",
  "void",
  "voided",
]);

const REVIEW_REQUIRED_PROJECT_EXPENSE_COST_STATUSES = new Set([
  "needs_review",
  "pending",
  "unreviewed",
]);

const REIMBURSEMENT_SCOPED_EXPENSE_STATUSES = new Set(["reimbursable", "reimbursed"]);

const FINALIZED_REIMBURSEMENT_COST_STATUSES = new Set(["paid", "done", "completed"]);
const PENDING_REIMBURSEMENT_COST_STATUSES = new Set(["needs_review", "pending", "unreviewed"]);
const COMMITTED_REIMBURSEMENT_COST_STATUSES = new Set([
  "approved",
  ...PENDING_REIMBURSEMENT_COST_STATUSES,
]);

export function createEmptyProjectFinancialSnapshotDiagnostics(): ProjectFinancialSnapshotDiagnostics {
  return {
    expenseLinesLoaded: 0,
    expenseHeaderFallbackCount: 0,
    excludedExpenseCount: 0,
    pendingExpenseCost: 0,
    pendingExpenseCount: 0,
    changeOrdersLoaded: 0,
    approvedChangeOrdersCount: 0,
    reimbursementDedupedCount: 0,
    pendingReimbursementCost: 0,
    pendingReimbursementCount: 0,
    committedReimbursementCost: 0,
    committedReimbursementCount: 0,
    subcontractCashOut: 0,
    openSubcontractAP: 0,
    openAP: 0,
    apCashOut: 0,
    apBillCount: 0,
    apDiagnosticsWarnings: [],
    missingSchemaWarnings: [],
    pendingCostReviewWarnings: [],
  };
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function toMoney(value: unknown): number {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function rowAmount(row: ProjectFinancialAmountRow): number {
  return toMoney(
    row.amount ??
      row.total ??
      row.totalAmount ??
      row.total_amount ??
      row.costAmount ??
      row.cost_amount
  );
}

function isVoidStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "void" || s === "voided" || s === "cancelled" || s === "canceled";
}

function isDraftInvoiceStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "draft";
}

function sumNonVoidRows(rows: ProjectFinancialAmountRow[] | undefined): number {
  return toMoney(
    (rows ?? []).reduce((sum, row) => (isVoidStatus(row.status) ? sum : sum + rowAmount(row)), 0)
  );
}

function warning(
  code: string,
  severity: ProjectFinancialWarningSeverity,
  message: string,
  sourceId?: string | null
): ProjectFinancialWarning {
  return {
    code,
    severity,
    message,
    ...(sourceId ? { sourceId } : {}),
  };
}

export function projectExpenseCostStatusDecision(
  status: string | null | undefined
): ExpenseProjectCostStatusDecision {
  const normalized = normalizeStatus(status);
  if (INCLUDED_PROJECT_EXPENSE_COST_STATUSES.has(normalized)) {
    return { status: normalized, included: true, reason: "finalized_cost_status" };
  }
  if (EXCLUDED_PROJECT_EXPENSE_COST_STATUSES.has(normalized)) {
    return { status: normalized, included: false, reason: "excluded_terminal_status" };
  }
  if (REVIEW_REQUIRED_PROJECT_EXPENSE_COST_STATUSES.has(normalized)) {
    return {
      status: normalized,
      included: false,
      reason: "pending_review_cost_status",
      warningCode:
        normalized === "needs_review"
          ? "expense_status_needs_review"
          : normalized === "unreviewed"
            ? "expense_status_unreviewed"
            : "expense_status_pending",
    };
  }
  if (REIMBURSEMENT_SCOPED_EXPENSE_STATUSES.has(normalized)) {
    return {
      status: normalized,
      included: false,
      reason: "reimbursement_source_scope_required",
      warningCode: "expense_reimbursement_status_source_scope_required",
    };
  }
  if (!normalized) {
    return {
      status: normalized,
      included: false,
      reason: "pending_review_cost_status",
      warningCode: "expense_status_missing",
    };
  }
  return {
    status: normalized,
    included: false,
    reason: "unrecognized_status",
    warningCode: "expense_status_unrecognized",
  };
}

export function expenseStatusCountsTowardProjectCost(status: string | null | undefined): boolean {
  return projectExpenseCostStatusDecision(status).included;
}

export function expenseStatusCountsTowardPendingCostReview(
  status: string | null | undefined
): boolean {
  return projectExpenseCostStatusDecision(status).reason === "pending_review_cost_status";
}

function reimbursementKeyFromExpenseLine(line: ProjectFinancialExpenseLineInput): string | null {
  const source = normalizeStatus(line.source);
  const category = normalizeStatus(line.category);
  const sourceId = String(line.sourceId ?? line.linkedReimbursementId ?? "").trim();
  if (sourceId && (source.includes("reimbursement") || category.includes("reimbursement"))) {
    return sourceId;
  }
  return null;
}

function calculateExpenseCost(
  expenseLines: ProjectFinancialExpenseLineInput[] | undefined,
  warnings: ProjectFinancialWarning[]
): {
  expenseCost: number;
  reimbursementExpenseIds: Set<string>;
  pendingExpenseCost: number;
  pendingExpenseCount: number;
  pendingCostReviewWarnings: string[];
} {
  let expenseCost = 0;
  let pendingExpenseCost = 0;
  let pendingExpenseCount = 0;
  const reimbursementExpenseIds = new Set<string>();
  const pendingCostReviewWarnings = new Set<string>();

  for (const line of expenseLines ?? []) {
    const decision = projectExpenseCostStatusDecision(line.status);
    if (decision.warningCode) {
      warnings.push(
        warning(
          decision.warningCode,
          "warning",
          `Expense line is not included in project actual cost because status is ${decision.status || "missing"}.`,
          line.id ?? line.expenseId
        )
      );
    }
    if (!decision.included) {
      if (decision.reason === "pending_review_cost_status") {
        pendingExpenseCost += rowAmount(line);
        pendingExpenseCount += 1;
        if (decision.warningCode) pendingCostReviewWarnings.add(decision.warningCode);
      }
      continue;
    }

    expenseCost += rowAmount(line);
    const reimbKey = reimbursementKeyFromExpenseLine(line);
    if (reimbKey) reimbursementExpenseIds.add(reimbKey);
  }

  return {
    expenseCost: toMoney(expenseCost),
    reimbursementExpenseIds,
    pendingExpenseCost: toMoney(pendingExpenseCost),
    pendingExpenseCount,
    pendingCostReviewWarnings: Array.from(pendingCostReviewWarnings),
  };
}

function reimbursementCountsTowardProjectCost(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return FINALIZED_REIMBURSEMENT_COST_STATUSES.has(normalized);
}

function reimbursementCountsTowardPendingDiagnostics(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return !normalized || PENDING_REIMBURSEMENT_COST_STATUSES.has(normalized);
}

function reimbursementCountsTowardCommittedDiagnostics(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return !normalized || COMMITTED_REIMBURSEMENT_COST_STATUSES.has(normalized);
}

function calculateReimbursementCost(
  reimbursements: ProjectFinancialReimbursementInput[] | undefined,
  reimbursementExpenseIds: Set<string>,
  warnings: ProjectFinancialWarning[]
): {
  reimbursementCost: number;
  pendingReimbursementCost: number;
  pendingReimbursementCount: number;
  committedReimbursementCost: number;
  committedReimbursementCount: number;
  reimbursementDedupedCount: number;
  pendingCostReviewWarnings: string[];
} {
  let total = 0;
  let pendingReimbursementCost = 0;
  let pendingReimbursementCount = 0;
  let committedReimbursementCost = 0;
  let committedReimbursementCount = 0;
  let reimbursementDedupedCount = 0;
  const pendingCostReviewWarnings = new Set<string>();
  for (const reimb of reimbursements ?? []) {
    const id = String(reimb.id ?? "").trim();
    const convertedExpenseId = String(
      reimb.convertedExpenseId ?? reimb.sourceExpenseId ?? ""
    ).trim();
    if ((id && reimbursementExpenseIds.has(id)) || convertedExpenseId) {
      reimbursementDedupedCount += 1;
      warnings.push(
        warning(
          "reimbursement_expense_deduped",
          "info",
          "Worker reimbursement was not added separately because it is already represented by an expense line.",
          id || convertedExpenseId
        )
      );
      continue;
    }
    const amount = rowAmount(reimb);
    if (!reimbursementCountsTowardProjectCost(reimb.status)) {
      if (reimbursementCountsTowardPendingDiagnostics(reimb.status)) {
        pendingReimbursementCost += amount;
        pendingReimbursementCount += 1;
        pendingCostReviewWarnings.add("reimbursement_pending_review");
      }
      if (reimbursementCountsTowardCommittedDiagnostics(reimb.status)) {
        committedReimbursementCost += amount;
        committedReimbursementCount += 1;
        pendingCostReviewWarnings.add("reimbursement_committed_not_paid");
      }
      warnings.push(
        warning(
          "reimbursement_not_finalized",
          "warning",
          "Worker reimbursement is not included in project actual cost until it is finalized.",
          id || null
        )
      );
      continue;
    }
    total += amount;
  }
  return {
    reimbursementCost: toMoney(total),
    pendingReimbursementCost: toMoney(pendingReimbursementCost),
    pendingReimbursementCount,
    committedReimbursementCost: toMoney(committedReimbursementCost),
    committedReimbursementCount,
    reimbursementDedupedCount,
    pendingCostReviewWarnings: Array.from(pendingCostReviewWarnings),
  };
}

function calculateLaborCost(laborEntries: ProjectFinancialLaborEntryInput[] | undefined): number {
  let total = 0;
  for (const entry of laborEntries ?? []) {
    if (isVoidStatus(entry.status)) continue;
    total += rowAmount(entry);
  }
  return toMoney(total);
}

function calculateInvoiceAmounts(invoices: ProjectFinancialInvoiceInput[] | undefined): {
  billedAmount: number;
  paidAmount: number;
} {
  let billedAmount = 0;
  let paidAmount = 0;

  for (const invoice of invoices ?? []) {
    if (isVoidStatus(invoice.status) || isDraftInvoiceStatus(invoice.status)) continue;
    billedAmount += rowAmount(invoice);
    if (invoice.payments) {
      paidAmount += sumNonVoidRows(invoice.payments);
    } else {
      paidAmount += toMoney(invoice.paidAmount);
    }
  }

  return { billedAmount: toMoney(billedAmount), paidAmount: toMoney(paidAmount) };
}

export function calculateProjectFinancialSnapshot(
  input: ProjectFinancialSnapshotInput
): ProjectFinancialSnapshot {
  const warnings: ProjectFinancialWarning[] = [];
  const contractValue = toMoney(input.contractValue);
  const approvedChangeOrders = toMoney(input.approvedChangeOrders);
  const revisedContractValue = toMoney(contractValue + approvedChangeOrders);
  const { billedAmount, paidAmount } = calculateInvoiceAmounts(input.invoices);
  const {
    expenseCost,
    reimbursementExpenseIds,
    pendingExpenseCost,
    pendingExpenseCount,
    pendingCostReviewWarnings: pendingExpenseWarnings,
  } = calculateExpenseCost(input.expenseLines, warnings);
  const {
    reimbursementCost,
    pendingReimbursementCost,
    pendingReimbursementCount,
    committedReimbursementCost,
    committedReimbursementCount,
    reimbursementDedupedCount,
    pendingCostReviewWarnings: pendingReimbursementWarnings,
  } = calculateReimbursementCost(input.workerReimbursements, reimbursementExpenseIds, warnings);
  const laborCost = calculateLaborCost(input.laborEntries);
  const subcontractCost = sumNonVoidRows(input.subcontractCosts);
  const apCost = sumNonVoidRows(input.apCosts);
  const actualCost = toMoney(expenseCost + laborCost + reimbursementCost + subcontractCost);
  const grossProfit = toMoney(revisedContractValue - actualCost);
  const grossMargin = revisedContractValue > 0 ? grossProfit / revisedContractValue : 0;
  const cashCollected = paidAmount;
  const cashOut =
    input.cashOutPayments !== undefined
      ? sumNonVoidRows(input.cashOutPayments)
      : toMoney(expenseCost + reimbursementCost + laborCost + subcontractCost);

  if (apCost > 0) {
    warnings.push(
      warning(
        "ap_bills_not_in_actual_cost",
        "warning",
        "AP bills are reported as diagnostics only and are not included in project actual cost until duplicate-cost rules are explicit."
      )
    );
  }

  if (input.cashOutPayments === undefined) {
    warnings.push(
      warning(
        "cash_out_derived_from_actual_cost",
        "info",
        "Cash out is using actual cost as a fallback because explicit cash-out payments were not provided."
      )
    );
  }

  const diagnostics = createEmptyProjectFinancialSnapshotDiagnostics();
  diagnostics.pendingExpenseCost = pendingExpenseCost;
  diagnostics.pendingExpenseCount = pendingExpenseCount;
  diagnostics.pendingReimbursementCost = pendingReimbursementCost;
  diagnostics.pendingReimbursementCount = pendingReimbursementCount;
  diagnostics.committedReimbursementCost = committedReimbursementCost;
  diagnostics.committedReimbursementCount = committedReimbursementCount;
  diagnostics.reimbursementDedupedCount = reimbursementDedupedCount;
  diagnostics.pendingCostReviewWarnings = Array.from(
    new Set([...pendingExpenseWarnings, ...pendingReimbursementWarnings])
  );

  return {
    projectId: input.projectId,
    contractValue,
    approvedChangeOrders,
    revisedContractValue,
    billedAmount,
    paidAmount,
    openAR: toMoney(Math.max(0, billedAmount - paidAmount)),
    actualCost,
    expenseCost,
    laborCost,
    reimbursementCost,
    subcontractCost,
    apCost,
    grossProfit,
    grossMargin,
    cashCollected,
    cashOut,
    cashPosition: toMoney(cashCollected - cashOut),
    warnings,
    diagnostics,
  };
}
