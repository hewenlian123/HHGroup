import "server-only";

import {
  calculateProjectFinancialSnapshot,
  type ProjectFinancialAmountRow,
  type ProjectFinancialExpenseLineInput,
  type ProjectFinancialInvoiceInput,
  type ProjectFinancialLaborEntryInput,
  type ProjectFinancialReimbursementInput,
  type ProjectFinancialSnapshot,
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
};

type ProjectFinancialApBillRow = ProjectFinancialAmountRow & {
  project_id?: string | null;
  paid_amount?: number | string | null;
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

function isVoidLikeStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "void" || s === "voided" || s === "cancelled" || s === "canceled";
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

function warning(code: string, message: string, sourceId?: string | null): ProjectFinancialWarning {
  return {
    code,
    severity: "warning",
    message,
    ...(sourceId ? { sourceId } : {}),
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

function buildExpenseInputs(
  rows: ProjectFinancialSnapshotDbRows,
  mapperWarnings: ProjectFinancialWarning[]
): ProjectFinancialExpenseLineInput[] {
  const expenseMap = new Map(rows.expenses.map((expense) => [expense.id ?? "", expense]));
  const includedExpenseIds = new Set<string>();
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
    includedExpenseIds.add(expenseId);
    inputs.push({
      id: line.id,
      expenseId,
      amount: amountFromRow(line),
      status: expense?.status ?? line.status ?? null,
      referenceNo: expense?.reference_no ?? null,
      source: expense?.source ?? null,
      sourceId: expenseSourceId(expense),
      linkedReimbursementId: expenseSourceId(expense),
      category: line.category ?? expense?.category ?? null,
    });
  }

  for (const expense of rows.expenses) {
    const expenseId = String(expense.id ?? "").trim();
    if (!expenseId || includedExpenseIds.has(expenseId)) continue;
    if (String(expense.project_id ?? "").trim() !== rows.projectId) continue;
    const amount = amountFromRow(expense);
    if (amount <= 0) continue;
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
  for (const bill of rows.subcontractBills) {
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
} {
  const mapperWarnings: ProjectFinancialWarning[] = [];
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

  const approvedChangeOrders = rows.changeOrders
    .filter((row) => isApprovedStatus(row.status))
    .reduce((sum, row) => sum + amountFromRow(row), 0);
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

  const expenseLines = buildExpenseInputs(rows, mapperWarnings);
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
  const subcontractCosts: ProjectFinancialAmountRow[] = rows.subcontractBills
    .filter((bill) => isApprovedStatus(bill.status))
    .map((bill) => ({ id: bill.id, amount: amountFromRow(bill), status: bill.status }));
  const apCosts: ProjectFinancialAmountRow[] = rows.apBills
    .filter((bill) => !isVoidLikeStatus(bill.status) && normalizeStatus(bill.status) !== "draft")
    .map((bill) => ({ id: bill.id, amount: amountFromRow(bill), status: bill.status }));

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
  };
}

export function mapProjectFinancialRowsToSnapshot(
  rows: ProjectFinancialSnapshotDbRows
): ProjectFinancialSnapshot {
  const { input, warnings } = buildProjectFinancialSnapshotInput(rows);
  const snapshot = calculateProjectFinancialSnapshot(input);
  return { ...snapshot, warnings: [...snapshot.warnings, ...warnings] };
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

  return {
    projectId: input.projectId,
    oldCanonicalProfit: input.oldCanonicalProfit ?? null,
    oldProjectCostDashboard: input.oldProjectCostDashboard ?? null,
    newSnapshot,
    differences,
    warnings: [...(input.warnings ?? []), ...newSnapshot.warnings],
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
  ] = await Promise.all([
    supabase.from("projects").select("id,budget,contract_amount").eq("id", projectId).maybeSingle(),
    safeSelect<ProjectFinancialChangeOrderRow>(
      "project_change_orders",
      supabase
        .from("project_change_orders")
        .select("id,project_id,status,amount,total,total_amount")
        .eq("project_id", projectId)
    ),
    safeSelect<ProjectFinancialInvoiceRow>(
      "invoices",
      supabase
        .from("invoices")
        .select("id,project_id,status,total,paid_total,balance_due")
        .eq("project_id", projectId)
    ),
    safeSelect<ProjectFinancialExpenseLineRow>(
      "expense_lines",
      supabase
        .from("expense_lines")
        .select("id,expense_id,project_id,amount,total,category,memo")
        .eq("project_id", projectId)
    ),
    safeSelect<ProjectFinancialExpenseRow>(
      "expenses",
      supabase
        .from("expenses")
        .select("id,project_id,status,total,amount,reference_no,source,source_id,category")
        .eq("project_id", projectId)
    ),
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
  ]);

  if (projectRes.error) throw new Error(projectRes.error.message ?? "Failed to load project.");
  if (!projectRes.data) throw new Error("Project not found.");

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
      safeSelect<ProjectFinancialExpenseRow>(
        "expenses",
        supabase
          .from("expenses")
          .select("id,project_id,status,total,amount,reference_no,source,source_id,category")
          .in("id", expenseIds)
      ),
      safeSelect<ProjectFinancialExpenseLineRow>(
        "expense_lines",
        supabase
          .from("expense_lines")
          .select("id,expense_id,project_id,amount,total,category,memo")
          .in("expense_id", expenseIds)
      ),
    ]);
    expenses = headersByIdRes.data.length > 0 ? headersByIdRes.data : expenses;
    expenseLines = linesByExpenseRes.data.length > 0 ? linesByExpenseRes.data : expenseLines;
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

  return {
    rows: {
      projectId,
      project: projectRes.data as ProjectFinancialProjectRow,
      changeOrders: changeOrdersRes.data,
      invoices: invoicesRes.data,
      invoicePayments: invoicePaymentsRes.data,
      expenses,
      expenseLines,
      laborEntries: laborRes.data,
      workerReimbursements: reimbursementRes.data,
      subcontractBills: subcontractRes.data,
      // AP is intentionally left unmapped until the ap_bills table is present in the verified schema.
      apBills: [],
    },
    warnings: [
      ...changeOrdersRes.warnings,
      ...invoicesRes.warnings,
      ...directExpenseLinesRes.warnings,
      ...expensesByProjectRes.warnings,
      ...laborRes.warnings,
      ...reimbursementRes.warnings,
      ...subcontractRes.warnings,
      ...invoicePaymentsRes.warnings,
      ...extraWarnings,
      warning(
        "ap_bills_not_mapped",
        "AP bills are not included yet because the local verified schema does not expose ap_bills."
      ),
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
