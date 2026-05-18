import "server-only";

import {
  calculateProjectFinancialSnapshot,
  createEmptyProjectFinancialSnapshotDiagnostics,
  projectExpenseCostStatusDecision,
  type ProjectFinancialAmountRow,
  type ProjectFinancialExpenseLineInput,
  type ProjectFinancialInvoiceInput,
  type ProjectFinancialLaborEntryInput,
  type ProjectFinancialReimbursementInput,
  type ProjectFinancialSnapshot,
  type ProjectFinancialSnapshotDiagnostics,
  type ProjectFinancialSnapshotInput,
  type ProjectFinancialWarning,
} from "@/lib/financial/project-financial-snapshot";
import {
  getProjectCostDashboard,
  type ProjectCostDashboardPayload,
} from "@/lib/project-cost-dashboard";
import {
  getServerSupabaseInternalNoStore,
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
} from "@/lib/supabase-server";
import { getCanonicalProjectProfit, type CanonicalProjectProfit } from "@/lib/profit-engine";

type DbErrorLike = {
  message?: string;
  code?: string;
};

type ProjectFinancialProjectRow = {
  id: string;
  budget?: number | string | null;
  contract_amount?: number | string | null;
};

type ProjectFinancialChangeOrderRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  total_amount?: number | string | null;
  item_total?: number | string | null;
};

type ProjectFinancialInvoiceRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  paid_total?: number | string | null;
};

type ProjectFinancialInvoicePaymentRow = ProjectFinancialAmountRow & {
  invoice_id?: string | null;
};

type ProjectFinancialExpenseRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  reference_no?: string | null;
  source?: string | null;
  source_id?: string | null;
  category?: string | null;
};

type ProjectFinancialExpenseLineRow = ProjectFinancialAmountRow & {
  expense_id?: string | null;
  project_id?: string | null;
  category?: string | null;
  memo?: string | null;
};

type ProjectFinancialLaborEntryRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  worker_payment_id?: string | null;
};

type ProjectFinancialWorkerReimbursementRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  payment_id?: string | null;
};

type ProjectFinancialSubcontractBillRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  subcontract_id?: string | null;
};

type ProjectFinancialSubcontractPaymentRow = ProjectFinancialAmountRow & {
  subcontract_id?: string | null;
  bill_id?: string | null;
};

type ProjectFinancialApBillRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  bill_type?: string | null;
  paid_amount?: number | string | null;
  balance_amount?: number | string | null;
};

export type ProjectFinancialSnapshotDbRows = {
  projectId: string;
  project: ProjectFinancialProjectRow | null;
  changeOrders: ProjectFinancialChangeOrderRow[];
  invoices: ProjectFinancialInvoiceRow[];
  invoicePayments: ProjectFinancialInvoicePaymentRow[];
  expenses: ProjectFinancialExpenseRow[];
  expenseLines: ProjectFinancialExpenseLineRow[];
  laborEntries: ProjectFinancialLaborEntryRow[];
  workerReimbursements: ProjectFinancialWorkerReimbursementRow[];
  subcontractBills: ProjectFinancialSubcontractBillRow[];
  subcontractPayments?: ProjectFinancialSubcontractPaymentRow[];
  apBills: ProjectFinancialApBillRow[];
};

export type ProjectFinancialSnapshotDifference = {
  key: string;
  label: string;
  oldValue: number;
  newValue: number;
  delta: number;
};

export type ProjectFinancialSnapshotComparison = {
  projectId: string;
  oldCanonicalProfit: CanonicalProjectProfit | null;
  oldProjectCostDashboard: Pick<
    ProjectCostDashboardPayload,
    "breakdown" | "spentTotal" | "profit" | "margin" | "revenue"
  > | null;
  newSnapshot: ProjectFinancialSnapshot;
  differences: ProjectFinancialSnapshotDifference[];
  warnings: ProjectFinancialWarning[];
  diagnostics: ProjectFinancialSnapshotDiagnostics;
};

type ComparisonInput = {
  projectId: string;
  newSnapshot: ProjectFinancialSnapshot;
  oldCanonicalProfit?: CanonicalProjectProfit | null;
  oldProjectCostDashboard?: Pick<
    ProjectCostDashboardPayload,
    "breakdown" | "spentTotal" | "profit" | "margin" | "revenue"
  > | null;
  warnings?: ProjectFinancialWarning[];
  diagnostics?: ProjectFinancialSnapshotDiagnostics;
};

function toMoney(value: unknown): number {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function toComparable(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function isApprovedStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "approved";
}

function isPaidLikeStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "paid" || s === "done" || s === "completed";
}

function isSubcontractCostStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return (
    s === "approved" ||
    s === "paid" ||
    s === "partial" ||
    s === "partially_paid" ||
    s === "done" ||
    s === "completed"
  );
}

function isDraftLikeStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "draft";
}

function isVoidLikeStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return (
    s === "void" || s === "voided" || s === "cancelled" || s === "canceled" || s === "rejected"
  );
}

function amountFromRow(row: ProjectFinancialAmountRow): number {
  return toMoney(
    row.amount ??
      row.total ??
      row.totalAmount ??
      row.total_amount ??
      row.costAmount ??
      row.cost_amount
  );
}

function paymentSumByBillId(
  payments: ProjectFinancialSubcontractPaymentRow[] | undefined
): Map<string, number> {
  const byBillId = new Map<string, number>();
  for (const payment of payments ?? []) {
    const billId = String(payment.bill_id ?? "").trim();
    if (!billId) continue;
    byBillId.set(billId, (byBillId.get(billId) ?? 0) + amountFromRow(payment));
  }
  return byBillId;
}

function apBillOpenBalance(bill: ProjectFinancialApBillRow): number {
  if (bill.balance_amount != null) return Math.max(0, toMoney(bill.balance_amount));
  return Math.max(0, toMoney(amountFromRow(bill) - toMoney(bill.paid_amount)));
}

function isActiveApBillForDiagnostics(bill: ProjectFinancialApBillRow): boolean {
  return !isVoidLikeStatus(bill.status) && !isDraftLikeStatus(bill.status);
}

function warning(code: string, message: string, sourceId?: string | null): ProjectFinancialWarning {
  return {
    code,
    severity: "warning",
    message,
    ...(sourceId ? { sourceId } : {}),
  };
}

function createDiagnostics(): ProjectFinancialSnapshotDiagnostics {
  return createEmptyProjectFinancialSnapshotDiagnostics();
}

function diagnosticsFromWarnings(
  warnings: ProjectFinancialWarning[]
): Pick<
  ProjectFinancialSnapshotDiagnostics,
  "reimbursementDedupedCount" | "missingSchemaWarnings"
> {
  return {
    reimbursementDedupedCount: warnings.filter(
      (item) => item.code === "reimbursement_expense_deduped"
    ).length,
    missingSchemaWarnings: [
      ...new Set(
        warnings
          .filter(
            (item) =>
              item.code.includes("unavailable") ||
              item.code.includes("missing") ||
              /schema|column|table/i.test(item.message)
          )
          .map((item) => item.code)
      ),
    ],
  };
}

function missingTableOrColumn(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42703") return true;
  const message = error.message ?? "";
  return /schema cache|relation.*does not exist|could not find|column .* does not exist|pgrst204/i.test(
    message
  );
}

function expenseSourceId(expense: ProjectFinancialExpenseRow | null | undefined): string | null {
  const value = String(expense?.source_id ?? "").trim();
  return value || null;
}

function expenseLineAmountFromRow(
  line: ProjectFinancialExpenseLineRow,
  mapperWarnings: ProjectFinancialWarning[]
): number {
  const amount = toMoney(line.amount);
  const total = toMoney(line.total ?? line.totalAmount ?? line.total_amount);
  if (total > 0 && amount > 0 && Math.abs(total - amount) > 0.01) {
    mapperWarnings.push(
      warning(
        "expense_line_amount_total_mismatch",
        "Expense line amount and total differ; snapshot uses line total as the safer project cost value.",
        line.id ?? line.expense_id ?? null
      )
    );
    return total;
  }
  if (total > 0) return total;
  if (amount > 0) return amount;
  if (
    line.amount == null &&
    line.total == null &&
    line.totalAmount == null &&
    line.total_amount == null
  ) {
    mapperWarnings.push(
      warning(
        "expense_line_amount_unavailable",
        "Expense line did not expose amount or total; header fallback may be used if available.",
        line.id ?? line.expense_id ?? null
      )
    );
  }
  return 0;
}

function buildExpenseInputs(
  rows: ProjectFinancialSnapshotDbRows,
  mapperWarnings: ProjectFinancialWarning[],
  diagnostics: ProjectFinancialSnapshotDiagnostics
): ProjectFinancialExpenseLineInput[] {
  const expenseMap = new Map(rows.expenses.map((expense) => [expense.id ?? "", expense]));
  const lineBackedExpenseIds = new Set<string>();
  const inputs: ProjectFinancialExpenseLineInput[] = [];

  for (const line of rows.expenseLines) {
    const expenseId = String(line.expense_id ?? "").trim();
    const expense = expenseMap.get(expenseId);
    const lineProjectId = String(line.project_id ?? "").trim();
    const headerProjectId = String(expense?.project_id ?? "").trim();
    if (
      lineProjectId !== rows.projectId &&
      !(lineProjectId === "" && headerProjectId === rows.projectId)
    ) {
      continue;
    }
    const status = expense?.status ?? line.status ?? null;
    const decision = projectExpenseCostStatusDecision(status);
    if (!decision.included) diagnostics.excludedExpenseCount += 1;
    const amount = expenseLineAmountFromRow(line, mapperWarnings);
    diagnostics.expenseLinesLoaded += 1;
    if (expenseId && amount > 0) lineBackedExpenseIds.add(expenseId);
    inputs.push({
      id: line.id,
      expenseId,
      amount,
      status,
      referenceNo: expense?.reference_no ?? null,
      source: expense?.source ?? null,
      sourceId: expenseSourceId(expense),
      linkedReimbursementId: expenseSourceId(expense),
      category: line.category ?? expense?.category ?? null,
    });
  }

  for (const expense of rows.expenses) {
    const expenseId = String(expense.id ?? "").trim();
    if (!expenseId || lineBackedExpenseIds.has(expenseId)) continue;
    if (String(expense.project_id ?? "").trim() !== rows.projectId) continue;
    const amount = amountFromRow(expense);
    if (amount <= 0) continue;
    const decision = projectExpenseCostStatusDecision(expense.status);
    if (!decision.included) diagnostics.excludedExpenseCount += 1;
    if (decision.included) diagnostics.expenseHeaderFallbackCount += 1;
    mapperWarnings.push(
      warning(
        "expense_header_without_lines_used",
        "Expense header amount was mapped because no project expense line was found.",
        expenseId
      )
    );
    inputs.push({
      id: `expense-header:${expenseId}`,
      expenseId,
      amount,
      status: expense.status ?? null,
      referenceNo: expense.reference_no ?? null,
      source: expense.source ?? null,
      sourceId: expenseSourceId(expense),
      linkedReimbursementId: expenseSourceId(expense),
      category: expense.category ?? null,
    });
  }

  return inputs;
}

function changeOrderAmountFromRow(
  row: ProjectFinancialChangeOrderRow,
  mapperWarnings: ProjectFinancialWarning[]
): number {
  const rowAmount = amountFromRow(row);
  if (rowAmount > 0) return rowAmount;
  const itemTotal = toMoney(row.item_total);
  if (itemTotal > 0) {
    mapperWarnings.push(
      warning(
        "change_order_item_total_used",
        "Approved change order header total was empty; snapshot uses summed line item total.",
        row.id ?? null
      )
    );
    return itemTotal;
  }
  return 0;
}

function buildCashOutPayments(
  rows: ProjectFinancialSnapshotDbRows,
  expenseInputs: ProjectFinancialExpenseLineInput[]
): ProjectFinancialAmountRow[] {
  const expenseMap = new Map(rows.expenses.map((expense) => [expense.id ?? "", expense]));
  const reimbursementExpenseIds = new Set(
    expenseInputs
      .map((line) => String(line.sourceId ?? line.linkedReimbursementId ?? "").trim())
      .filter(Boolean)
  );
  const cashRows: ProjectFinancialAmountRow[] = [];

  for (const line of expenseInputs) {
    const expense = expenseMap.get(String(line.expenseId ?? ""));
    if (isPaidLikeStatus(expense?.status ?? line.status)) cashRows.push(line);
  }
  for (const entry of rows.laborEntries) {
    if (isPaidLikeStatus(entry.status) || entry.worker_payment_id) {
      cashRows.push({ id: entry.id, amount: amountFromRow(entry), status: entry.status });
    }
  }
  for (const reimbursement of rows.workerReimbursements) {
    const id = String(reimbursement.id ?? "").trim();
    if (id && reimbursementExpenseIds.has(id)) continue;
    if (isPaidLikeStatus(reimbursement.status) || reimbursement.payment_id) {
      cashRows.push({
        id: reimbursement.id,
        amount: amountFromRow(reimbursement),
        status: reimbursement.status,
      });
    }
  }
  const subcontractPayments = rows.subcontractPayments ?? [];
  const subcontractPaymentBillIds = new Set<string>();
  for (const payment of subcontractPayments) {
    const billId = String(payment.bill_id ?? "").trim();
    if (billId) subcontractPaymentBillIds.add(billId);
    cashRows.push({ id: payment.id, amount: amountFromRow(payment), status: payment.status });
  }
  for (const bill of rows.subcontractBills) {
    const billId = String(bill.id ?? "").trim();
    if (billId && subcontractPaymentBillIds.has(billId)) continue;
    if (isPaidLikeStatus(bill.status)) {
      cashRows.push({ id: bill.id, amount: amountFromRow(bill), status: bill.status });
    }
  }
  for (const bill of rows.apBills) {
    const paidAmount = toMoney(bill.paid_amount);
    if (paidAmount > 0) {
      cashRows.push({ id: bill.id, amount: paidAmount, status: bill.status });
    } else if (isPaidLikeStatus(bill.status)) {
      cashRows.push({ id: bill.id, amount: amountFromRow(bill), status: bill.status });
    }
  }

  return cashRows;
}

export function buildProjectFinancialSnapshotInput(rows: ProjectFinancialSnapshotDbRows): {
  input: ProjectFinancialSnapshotInput;
  warnings: ProjectFinancialWarning[];
  diagnostics: ProjectFinancialSnapshotDiagnostics;
} {
  const mapperWarnings: ProjectFinancialWarning[] = [];
  const diagnostics = createDiagnostics();
  const projectBudget = toMoney(rows.project?.budget);
  const projectContractAmount = toMoney(rows.project?.contract_amount);
  if (projectBudget > 0 && projectContractAmount > 0 && projectBudget !== projectContractAmount) {
    mapperWarnings.push(
      warning(
        "project_contract_amount_mismatch",
        "projects.budget and projects.contract_amount differ; snapshot uses projects.budget to match current canonical profit.",
        rows.project?.id ?? rows.projectId
      )
    );
  }

  diagnostics.changeOrdersLoaded = rows.changeOrders.length;
  const approvedChangeOrders = rows.changeOrders
    .filter((row) => isApprovedStatus(row.status))
    .reduce((sum, row) => {
      diagnostics.approvedChangeOrdersCount += 1;
      return sum + changeOrderAmountFromRow(row, mapperWarnings);
    }, 0);
  const paymentsByInvoiceId = new Map<string, ProjectFinancialInvoicePaymentRow[]>();
  for (const payment of rows.invoicePayments) {
    const invoiceId = String(payment.invoice_id ?? "").trim();
    if (!invoiceId) continue;
    const list = paymentsByInvoiceId.get(invoiceId) ?? [];
    list.push(payment);
    paymentsByInvoiceId.set(invoiceId, list);
  }

  const invoices: ProjectFinancialInvoiceInput[] = rows.invoices.map((invoice) => {
    const id = String(invoice.id ?? "").trim();
    const payments = paymentsByInvoiceId.get(id);
    return {
      id,
      total: amountFromRow(invoice),
      status: invoice.status ?? null,
      ...(payments ? { payments } : { paidAmount: invoice.paid_total ?? null }),
    };
  });

  const expenseLines = buildExpenseInputs(rows, mapperWarnings, diagnostics);
  const laborEntries: ProjectFinancialLaborEntryInput[] = rows.laborEntries.map((entry) => ({
    id: entry.id,
    amount: amountFromRow(entry),
    status: entry.status ?? null,
    workerPaymentId: entry.worker_payment_id ?? null,
  }));
  const workerReimbursements: ProjectFinancialReimbursementInput[] = rows.workerReimbursements.map(
    (reimbursement) => ({
      id: reimbursement.id,
      amount: amountFromRow(reimbursement),
      status: reimbursement.status ?? null,
    })
  );
  const subcontractPaymentTotals = paymentSumByBillId(rows.subcontractPayments);
  const subcontractCosts: ProjectFinancialAmountRow[] = [];
  for (const bill of rows.subcontractBills) {
    const amount = amountFromRow(bill);
    const status = bill.status ?? null;
    const billId = String(bill.id ?? "").trim();
    if (isSubcontractCostStatus(status)) {
      subcontractCosts.push({ id: bill.id, amount, status });
      diagnostics.openSubcontractAP += Math.max(
        0,
        amount - (subcontractPaymentTotals.get(billId) ?? 0)
      );
      continue;
    }
    if (!isVoidLikeStatus(status) && !isDraftLikeStatus(status)) {
      mapperWarnings.push(
        warning(
          "subcontract_bill_not_finalized",
          "Subcontract bill is not included in project actual cost until it is approved or paid.",
          bill.id ?? null
        )
      );
    }
  }

  diagnostics.subcontractCashOut = toMoney(
    (rows.subcontractPayments ?? []).reduce((sum, payment) => sum + amountFromRow(payment), 0)
  );

  const activeApBills = rows.apBills.filter(isActiveApBillForDiagnostics);
  const apCosts: ProjectFinancialAmountRow[] = activeApBills.map((bill) => ({
    id: bill.id,
    amount: amountFromRow(bill),
    status: bill.status,
  }));
  diagnostics.apBillCount = activeApBills.length;
  diagnostics.openAP = toMoney(
    activeApBills.reduce((sum, bill) => sum + apBillOpenBalance(bill), 0)
  );
  diagnostics.apCashOut = toMoney(
    activeApBills.reduce((sum, bill) => sum + toMoney(bill.paid_amount), 0)
  );
  if (activeApBills.length > 0) {
    diagnostics.apDiagnosticsWarnings.push("ap_bills_not_in_actual_cost");
    const hasMappedCost =
      expenseLines.length > 0 ||
      laborEntries.length > 0 ||
      subcontractCosts.length > 0 ||
      activeApBills.some((bill) => normalizeStatus(bill.bill_type).includes("labor"));
    if (hasMappedCost) diagnostics.apDiagnosticsWarnings.push("ap_bills_possible_duplicate_cost");
    mapperWarnings.push(
      warning(
        "ap_bills_possible_duplicate_cost",
        "AP bills are shown as diagnostics only because they may duplicate expense, labor, or subcontract costs already mapped into actual cost."
      )
    );
  }
  diagnostics.openSubcontractAP = toMoney(diagnostics.openSubcontractAP);

  diagnostics.missingSchemaWarnings = diagnosticsFromWarnings(mapperWarnings).missingSchemaWarnings;

  return {
    input: {
      projectId: rows.projectId,
      contractValue: projectBudget || projectContractAmount,
      approvedChangeOrders,
      invoices,
      expenseLines,
      laborEntries,
      workerReimbursements,
      subcontractCosts,
      apCosts,
      cashOutPayments: buildCashOutPayments(rows, expenseLines),
    },
    warnings: mapperWarnings,
    diagnostics,
  };
}

export function mapProjectFinancialRowsToSnapshot(
  rows: ProjectFinancialSnapshotDbRows
): ProjectFinancialSnapshot {
  const { input, warnings, diagnostics } = buildProjectFinancialSnapshotInput(rows);
  const snapshot = calculateProjectFinancialSnapshot(input);
  const allWarnings = [...snapshot.warnings, ...warnings];
  const warningDiagnostics = diagnosticsFromWarnings(allWarnings);
  const snapshotDiagnostics = snapshot.diagnostics ?? createDiagnostics();
  return {
    ...snapshot,
    warnings: allWarnings,
    diagnostics: {
      ...diagnostics,
      pendingExpenseCost: snapshotDiagnostics.pendingExpenseCost,
      pendingExpenseCount: snapshotDiagnostics.pendingExpenseCount,
      pendingReimbursementCost: snapshotDiagnostics.pendingReimbursementCost,
      pendingReimbursementCount: snapshotDiagnostics.pendingReimbursementCount,
      committedReimbursementCost: snapshotDiagnostics.committedReimbursementCost,
      committedReimbursementCount: snapshotDiagnostics.committedReimbursementCount,
      reimbursementDedupedCount: warningDiagnostics.reimbursementDedupedCount,
      missingSchemaWarnings: [
        ...new Set([
          ...diagnostics.missingSchemaWarnings,
          ...warningDiagnostics.missingSchemaWarnings,
        ]),
      ],
      pendingCostReviewWarnings: [
        ...new Set([
          ...diagnostics.pendingCostReviewWarnings,
          ...snapshotDiagnostics.pendingCostReviewWarnings,
        ]),
      ],
    },
  };
}

function addDifference(
  differences: ProjectFinancialSnapshotDifference[],
  key: string,
  label: string,
  oldValue: unknown,
  newValue: unknown
): void {
  const oldNumber = toComparable(oldValue);
  const newNumber = toComparable(newValue);
  const delta = toComparable(newNumber - oldNumber);
  if (Math.abs(delta) <= 0.01) return;
  differences.push({ key, label, oldValue: oldNumber, newValue: newNumber, delta });
}

export function buildProjectFinancialSnapshotComparison(
  input: ComparisonInput
): ProjectFinancialSnapshotComparison {
  const { newSnapshot } = input;
  const differences: ProjectFinancialSnapshotDifference[] = [];

  if (input.oldCanonicalProfit) {
    addDifference(
      differences,
      "canonical.revenue",
      "Canonical revenue vs revised contract value",
      input.oldCanonicalProfit.revenue,
      newSnapshot.revisedContractValue
    );
    addDifference(
      differences,
      "canonical.actualCost",
      "Canonical actual cost vs snapshot actual cost",
      input.oldCanonicalProfit.actualCost,
      newSnapshot.actualCost
    );
    addDifference(
      differences,
      "canonical.profit",
      "Canonical profit vs snapshot gross profit",
      input.oldCanonicalProfit.profit,
      newSnapshot.grossProfit
    );
    addDifference(
      differences,
      "canonical.margin",
      "Canonical margin vs snapshot gross margin",
      input.oldCanonicalProfit.margin,
      newSnapshot.grossMargin
    );
    addDifference(
      differences,
      "canonical.laborCost",
      "Canonical labor cost vs snapshot labor cost",
      input.oldCanonicalProfit.laborCost,
      newSnapshot.laborCost
    );
    addDifference(
      differences,
      "canonical.expenseCost",
      "Canonical expense cost vs snapshot expense cost",
      input.oldCanonicalProfit.expenseCost,
      newSnapshot.expenseCost
    );
    addDifference(
      differences,
      "canonical.subcontractCost",
      "Canonical subcontract cost vs snapshot subcontract cost",
      input.oldCanonicalProfit.subcontractCost,
      newSnapshot.subcontractCost
    );
    addDifference(
      differences,
      "canonical.approvedChangeOrders",
      "Canonical approved change orders vs snapshot approved change orders",
      input.oldCanonicalProfit.approvedChangeOrders,
      newSnapshot.approvedChangeOrders
    );
  }

  if (input.oldProjectCostDashboard) {
    addDifference(
      differences,
      "projectCostDashboard.spentTotal",
      "Project cost dashboard spent total vs snapshot actual cost",
      input.oldProjectCostDashboard.spentTotal,
      newSnapshot.actualCost
    );
    addDifference(
      differences,
      "projectCostDashboard.profit",
      "Project cost dashboard profit vs snapshot gross profit",
      input.oldProjectCostDashboard.profit,
      newSnapshot.grossProfit
    );
    addDifference(
      differences,
      "projectCostDashboard.margin",
      "Project cost dashboard margin vs snapshot gross margin",
      input.oldProjectCostDashboard.margin,
      newSnapshot.grossMargin
    );
    addDifference(
      differences,
      "projectCostDashboard.revenue",
      "Project cost dashboard revenue vs snapshot revised contract value",
      input.oldProjectCostDashboard.revenue,
      newSnapshot.revisedContractValue
    );
    addDifference(
      differences,
      "projectCostDashboard.breakdown.labor",
      "Project cost dashboard labor vs snapshot labor cost",
      input.oldProjectCostDashboard.breakdown.labor,
      newSnapshot.laborCost
    );
    addDifference(
      differences,
      "projectCostDashboard.breakdown.bills",
      "Project cost dashboard bills vs snapshot subcontract cost",
      input.oldProjectCostDashboard.breakdown.bills,
      newSnapshot.subcontractCost
    );
  }

  const allWarnings = [...(input.warnings ?? []), ...newSnapshot.warnings];
  const warningDiagnostics = diagnosticsFromWarnings(allWarnings);
  const diagnostics = {
    ...createDiagnostics(),
    ...(newSnapshot.diagnostics ?? {}),
    ...(input.diagnostics ?? {}),
  };
  diagnostics.reimbursementDedupedCount = warningDiagnostics.reimbursementDedupedCount;
  diagnostics.missingSchemaWarnings = [
    ...new Set([...diagnostics.missingSchemaWarnings, ...warningDiagnostics.missingSchemaWarnings]),
  ];

  return {
    projectId: input.projectId,
    oldCanonicalProfit: input.oldCanonicalProfit ?? null,
    oldProjectCostDashboard: input.oldProjectCostDashboard ?? null,
    newSnapshot,
    differences,
    warnings: allWarnings,
    diagnostics,
  };
}

async function safeSelect<T>(
  label: string,
  query: PromiseLike<{ data: unknown; error: DbErrorLike | null }>
): Promise<{ data: T[]; warnings: ProjectFinancialWarning[] }> {
  const { data, error } = await query;
  if (error) {
    if (missingTableOrColumn(error)) {
      return {
        data: [],
        warnings: [
          warning(
            `${label}_unavailable`,
            `${label} could not be loaded because the table or column is unavailable.`
          ),
        ],
      };
    }
    throw new Error(error.message ?? `Failed to load ${label}.`);
  }
  return { data: (Array.isArray(data) ? data : []) as T[], warnings: [] };
}

async function safeSelectFallback<T>(
  label: string,
  attempts: Array<() => PromiseLike<{ data: unknown; error: DbErrorLike | null }>>
): Promise<{ data: T[]; warnings: ProjectFinancialWarning[] }> {
  let lastMissing: DbErrorLike | null = null;
  for (const attempt of attempts) {
    const { data, error } = await attempt();
    if (!error) return { data: (Array.isArray(data) ? data : []) as T[], warnings: [] };
    if (!missingTableOrColumn(error)) {
      throw new Error(error.message ?? `Failed to load ${label}.`);
    }
    lastMissing = error;
  }
  return {
    data: [],
    warnings: [
      warning(
        `${label}_unavailable`,
        `${label} could not be loaded because the table or column is unavailable.`
      ),
      ...(lastMissing?.message
        ? [
            warning(
              `${label}_schema_detail`,
              `Last ${label} schema error: ${lastMissing.message.slice(0, 180)}`
            ),
          ]
        : []),
    ],
  };
}

function selectExpensesByProject(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  projectId: string
) {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  const cols = [
    "id,project_id,status,total,amount,reference_no,source,source_id,category",
    "id,project_id,status,total,amount,reference_no,source,source_id",
    "id,project_id,status,total,amount,reference_no",
    "id,project_id,status,total,amount",
    "id,project_id,status,total",
    "id,project_id,status,amount",
  ];
  return safeSelectFallback<ProjectFinancialExpenseRow>(
    "expenses",
    cols.map((col) => () => supabase.from("expenses").select(col).eq("project_id", projectId))
  );
}

function selectExpensesByIds(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  expenseIds: string[]
) {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  const cols = [
    "id,project_id,status,total,amount,reference_no,source,source_id,category",
    "id,project_id,status,total,amount,reference_no,source,source_id",
    "id,project_id,status,total,amount,reference_no",
    "id,project_id,status,total,amount",
    "id,project_id,status,total",
    "id,project_id,status,amount",
  ];
  return safeSelectFallback<ProjectFinancialExpenseRow>(
    "expenses",
    cols.map((col) => () => supabase.from("expenses").select(col).in("id", expenseIds))
  );
}

function selectExpenseLinesByProject(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  projectId: string
) {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  const cols = [
    "id,expense_id,project_id,total,amount,category,memo",
    "id,expense_id,project_id,total,amount",
    "id,expense_id,project_id,amount",
    "id,expense_id,project_id,total",
  ];
  return safeSelectFallback<ProjectFinancialExpenseLineRow>(
    "expense_lines_by_project",
    cols.map((col) => () => supabase.from("expense_lines").select(col).eq("project_id", projectId))
  );
}

function selectExpenseLinesByExpenseIds(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  expenseIds: string[]
) {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  const cols = [
    "id,expense_id,project_id,total,amount,category,memo",
    "id,expense_id,project_id,total,amount",
    "id,expense_id,total,amount,category,memo",
    "id,expense_id,total,amount",
    "id,expense_id,amount",
    "id,expense_id,total",
  ];
  return safeSelectFallback<ProjectFinancialExpenseLineRow>(
    "expense_lines",
    cols.map((col) => () => supabase.from("expense_lines").select(col).in("expense_id", expenseIds))
  );
}

function selectChangeOrdersByProject(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  projectId: string
) {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  const cols = [
    "id,project_id,status,total,total_amount,amount",
    "id,project_id,status,total,total_amount",
    "id,project_id,status,total",
    "id,project_id,status,total_amount",
    "id,project_id,status,amount",
    "id,project_id,status",
  ];
  return safeSelectFallback<ProjectFinancialChangeOrderRow>(
    "project_change_orders",
    cols.map(
      (col) => () => supabase.from("project_change_orders").select(col).eq("project_id", projectId)
    )
  );
}

function selectApBillsByProject(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  projectId: string
) {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  const cols = [
    "id,project_id,bill_type,amount,paid_amount,balance_amount,status",
    "id,project_id,bill_type,amount,paid_amount,status",
    "id,project_id,amount,paid_amount,status",
    "id,project_id,amount,status",
  ];
  return safeSelectFallback<ProjectFinancialApBillRow>(
    "ap_bills",
    cols.map((col) => () => supabase.from("ap_bills").select(col).eq("project_id", projectId))
  );
}

function selectSubcontractPaymentsByBillIds(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  billIds: string[]
) {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  if (billIds.length === 0) return Promise.resolve({ data: [], warnings: [] });
  return safeSelect<ProjectFinancialSubcontractPaymentRow>(
    "subcontract_payments",
    supabase
      .from("subcontract_payments")
      .select("id,subcontract_id,bill_id,amount")
      .in("bill_id", billIds)
  );
}

async function selectChangeOrderItemsByIds(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  changeOrderIds: string[]
): Promise<{
  itemTotalsByChangeOrderId: Map<string, number>;
  warnings: ProjectFinancialWarning[];
}> {
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);
  if (changeOrderIds.length === 0) return { itemTotalsByChangeOrderId: new Map(), warnings: [] };
  const result = await safeSelectFallback<{ change_order_id?: string | null; total?: unknown }>(
    "project_change_order_items",
    [
      () =>
        supabase
          .from("project_change_order_items")
          .select("change_order_id,total")
          .in("change_order_id", changeOrderIds),
    ]
  );
  const itemTotalsByChangeOrderId = new Map<string, number>();
  for (const row of result.data) {
    const id = String(row.change_order_id ?? "").trim();
    if (!id) continue;
    itemTotalsByChangeOrderId.set(
      id,
      (itemTotalsByChangeOrderId.get(id) ?? 0) + toMoney(row.total)
    );
  }
  return { itemTotalsByChangeOrderId, warnings: result.warnings };
}

function mergeById<T extends { id?: string | null }>(...lists: T[][]): T[] {
  const merged = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      merged.set(id, { ...(merged.get(id) ?? {}), ...row });
    }
  }
  return [...merged.values()];
}

async function fetchProjectFinancialSnapshotRows(
  projectId: string
): Promise<{ rows: ProjectFinancialSnapshotDbRows; warnings: ProjectFinancialWarning[] }> {
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const [
    projectRes,
    changeOrdersRes,
    invoicesRes,
    directExpenseLinesRes,
    expensesByProjectRes,
    laborRes,
    reimbursementRes,
    subcontractRes,
    apBillsRes,
  ] = await Promise.all([
    supabase.from("projects").select("id,budget,contract_amount").eq("id", projectId).maybeSingle(),
    selectChangeOrdersByProject(supabase, projectId),
    safeSelect<ProjectFinancialInvoiceRow>(
      "invoices",
      supabase
        .from("invoices")
        .select("id,project_id,status,total,paid_total,balance_due")
        .eq("project_id", projectId)
    ),
    selectExpenseLinesByProject(supabase, projectId),
    selectExpensesByProject(supabase, projectId),
    safeSelect<ProjectFinancialLaborEntryRow>(
      "labor_entries",
      supabase
        .from("labor_entries")
        .select("id,project_id,cost_amount,status,worker_payment_id")
        .eq("project_id", projectId)
    ),
    safeSelect<ProjectFinancialWorkerReimbursementRow>(
      "worker_reimbursements",
      supabase
        .from("worker_reimbursements")
        .select("id,project_id,amount,status,payment_id")
        .eq("project_id", projectId)
    ),
    safeSelect<ProjectFinancialSubcontractBillRow>(
      "subcontract_bills",
      supabase
        .from("subcontract_bills")
        .select("id,project_id,amount,status")
        .eq("project_id", projectId)
    ),
    selectApBillsByProject(supabase, projectId),
  ]);

  if (projectRes.error) throw new Error(projectRes.error.message ?? "Failed to load project.");
  if (!projectRes.data) throw new Error("Project not found.");

  const changeOrderIds = changeOrdersRes.data
    .map((order) => String(order.id ?? "").trim())
    .filter(Boolean);
  const changeOrderItemsRes = await selectChangeOrderItemsByIds(supabase, changeOrderIds);
  const changeOrders = changeOrdersRes.data.map((order) => {
    const id = String(order.id ?? "").trim();
    const itemTotal = id ? changeOrderItemsRes.itemTotalsByChangeOrderId.get(id) : undefined;
    return itemTotal != null ? { ...order, item_total: itemTotal } : order;
  });

  const initialExpenseIds = [
    ...(directExpenseLinesRes.data ?? []).map((line) => line.expense_id),
    ...(expensesByProjectRes.data ?? []).map((expense) => expense.id),
  ]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  const expenseIds = [...new Set(initialExpenseIds)];
  let expenses = expensesByProjectRes.data;
  let expenseLines = directExpenseLinesRes.data;
  const extraWarnings: ProjectFinancialWarning[] = [];

  if (expenseIds.length > 0) {
    const [headersByIdRes, linesByExpenseRes] = await Promise.all([
      selectExpensesByIds(supabase, expenseIds),
      selectExpenseLinesByExpenseIds(supabase, expenseIds),
    ]);
    expenses = mergeById(expenses ?? [], headersByIdRes.data);
    expenseLines = mergeById(expenseLines ?? [], linesByExpenseRes.data);
    extraWarnings.push(...headersByIdRes.warnings, ...linesByExpenseRes.warnings);
  }

  const invoiceIds = invoicesRes.data
    .map((invoice) => String(invoice.id ?? "").trim())
    .filter(Boolean);
  const invoicePaymentsRes =
    invoiceIds.length > 0
      ? await safeSelect<ProjectFinancialInvoicePaymentRow>(
          "invoice_payments",
          supabase
            .from("invoice_payments")
            .select("id,invoice_id,amount,status,payment_date,paid_at")
            .in("invoice_id", invoiceIds)
        )
      : { data: [], warnings: [] };
  const subcontractBillIds = subcontractRes.data
    .map((bill) => String(bill.id ?? "").trim())
    .filter(Boolean);
  const subcontractPaymentsRes = await selectSubcontractPaymentsByBillIds(
    supabase,
    subcontractBillIds
  );
  const apUnavailable = apBillsRes.warnings.length > 0;

  return {
    rows: {
      projectId,
      project: projectRes.data as ProjectFinancialProjectRow,
      changeOrders,
      invoices: invoicesRes.data,
      invoicePayments: invoicePaymentsRes.data,
      expenses,
      expenseLines,
      laborEntries: laborRes.data,
      workerReimbursements: reimbursementRes.data,
      subcontractBills: subcontractRes.data,
      subcontractPayments: subcontractPaymentsRes.data,
      apBills: apBillsRes.data,
    },
    warnings: [
      ...changeOrdersRes.warnings,
      ...changeOrderItemsRes.warnings,
      ...invoicesRes.warnings,
      ...directExpenseLinesRes.warnings,
      ...expensesByProjectRes.warnings,
      ...laborRes.warnings,
      ...reimbursementRes.warnings,
      ...subcontractRes.warnings,
      ...subcontractPaymentsRes.warnings,
      ...apBillsRes.warnings,
      ...invoicePaymentsRes.warnings,
      ...extraWarnings,
      ...(apUnavailable
        ? [
            warning(
              "ap_bills_not_mapped",
              "AP bills are not included in diagnostics because the AP schema is unavailable."
            ),
          ]
        : []),
    ],
  };
}

export async function getProjectFinancialSnapshot(
  projectId: string
): Promise<ProjectFinancialSnapshot> {
  const { rows, warnings } = await fetchProjectFinancialSnapshotRows(projectId);
  const snapshot = mapProjectFinancialRowsToSnapshot(rows);
  return { ...snapshot, warnings: [...snapshot.warnings, ...warnings] };
}

async function safeOldCanonicalProfit(
  projectId: string
): Promise<{ value: CanonicalProjectProfit | null; warning?: ProjectFinancialWarning }> {
  try {
    return { value: await getCanonicalProjectProfit(projectId) };
  } catch (error) {
    return {
      value: null,
      warning: warning(
        "old_canonical_profit_unavailable",
        error instanceof Error ? error.message : "Old canonical profit could not be loaded."
      ),
    };
  }
}

async function safeOldProjectCostDashboard(projectId: string): Promise<{
  value: Pick<
    ProjectCostDashboardPayload,
    "breakdown" | "spentTotal" | "profit" | "margin" | "revenue"
  > | null;
  warning?: ProjectFinancialWarning;
}> {
  try {
    const value = await getProjectCostDashboard(projectId);
    return {
      value: {
        breakdown: value.breakdown,
        spentTotal: value.spentTotal,
        profit: value.profit,
        margin: value.margin,
        revenue: value.revenue,
      },
    };
  } catch (error) {
    return {
      value: null,
      warning: warning(
        "old_project_cost_dashboard_unavailable",
        error instanceof Error ? error.message : "Old project cost dashboard could not be loaded."
      ),
    };
  }
}

export async function getProjectFinancialSnapshotComparison(
  projectId: string
): Promise<ProjectFinancialSnapshotComparison> {
  const [newSnapshot, oldCanonical, oldDashboard] = await Promise.all([
    getProjectFinancialSnapshot(projectId),
    safeOldCanonicalProfit(projectId),
    safeOldProjectCostDashboard(projectId),
  ]);
  const warnings = [oldCanonical.warning, oldDashboard.warning].filter(
    (item): item is ProjectFinancialWarning => Boolean(item)
  );
  return buildProjectFinancialSnapshotComparison({
    projectId,
    newSnapshot,
    oldCanonicalProfit: oldCanonical.value,
    oldProjectCostDashboard: oldDashboard.value,
    warnings,
  });
}
