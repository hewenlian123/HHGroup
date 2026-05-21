import { getProjectContractReviewIssues } from "@/lib/financial/project-financial-review";
import type { ProjectFinancialSnapshot } from "@/lib/financial/project-financial-snapshot";

export type DataQualitySeverity = "info" | "warning" | "critical";
export type DataQualityStatus = "ok" | "warning" | "critical";
export type DataQualityModule =
  | "projects"
  | "expenses"
  | "invoices"
  | "estimates"
  | "labor"
  | "reimbursements"
  | "company-profile";

export type DataQualityIssue = {
  severity: DataQualitySeverity;
  module: DataQualityModule;
  entityType: string;
  entityId?: string;
  entityName?: string;
  issueCode: string;
  message: string;
  currentValue?: string | number | null;
  expectedValue?: string | number | null;
  recommendedAction: string;
  link?: string;
};

export type DataQualityModuleSummary = {
  module: DataQualityModule;
  label: string;
  checked: number;
  critical: number;
  warning: number;
  info: number;
  status: DataQualityStatus;
};

export type DataQualityReportSummary = {
  status: DataQualityStatus;
  critical: number;
  warning: number;
  info: number;
  totalIssues: number;
  returnedIssues: number;
  projectsChecked: number;
  expensesChecked: number;
  invoicesChecked: number;
  estimatesChecked: number;
  laborChecked: number;
  reimbursementsChecked: number;
  companyProfileChecked: number;
};

export type DataQualityReport = {
  ok: boolean;
  checkedAt: string;
  summary: DataQualityReportSummary;
  modules: DataQualityModuleSummary[];
  issues: DataQualityIssue[];
};

export type UnknownRow = Record<string, unknown>;

export type ProjectSnapshotCheckResult =
  | { projectId: string; ok: true; snapshot: ProjectFinancialSnapshot }
  | { projectId: string; ok: false; message: string };

export type DataQualityRows = {
  projects?: UnknownRow[];
  projectSnapshots?: ProjectSnapshotCheckResult[];
  expenses?: UnknownRow[];
  expenseLines?: UnknownRow[];
  invoices?: UnknownRow[];
  invoiceItems?: UnknownRow[];
  invoicePayments?: UnknownRow[];
  estimates?: UnknownRow[];
  estimateItems?: UnknownRow[];
  laborEntries?: UnknownRow[];
  workerPayments?: UnknownRow[];
  workerAdvances?: UnknownRow[];
  workerReimbursements?: UnknownRow[];
  companyProfiles?: UnknownRow[];
  tableErrors?: Array<{ module: DataQualityModule; table: string; message: string }>;
  checkedAt?: string;
};

const MODULE_LABELS: Record<DataQualityModule, string> = {
  projects: "Projects",
  expenses: "Expenses",
  invoices: "Invoices",
  estimates: "Estimates",
  labor: "Labor",
  reimbursements: "Reimbursements",
  "company-profile": "Company profile",
};

const FINALIZED_EXPENSE_STATUSES = new Set(["reviewed", "done", "approved", "paid", "completed"]);
const EXCLUDED_STATUSES = new Set(["draft", "void", "voided", "rejected", "cancelled", "canceled"]);
const PENDING_STATUSES = new Set(["", "needs_review", "pending", "unreviewed"]);
const VOID_PAYMENT_STATUSES = new Set(["void", "voided", "cancelled", "canceled", "rejected"]);
const PAID_STATUSES = new Set(["paid", "complete", "completed", "posted"]);
const UNPAID_STATUSES = new Set(["unpaid", "draft", "open"]);
const FRACTIONAL_EPSILON = 0.000_001;
const MONEY_TOLERANCE = 0.01;
const MAX_ISSUES_PER_MODULE = 20;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowId(row: UnknownRow): string | undefined {
  const id = row.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function rowName(row: UnknownRow, fields: string[], fallback = "Unnamed"): string {
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return fallback;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function hasOwn(row: UnknownRow, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(number) ? number : null;
}

function issueValue(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function firstNumber(row: UnknownRow, fields: string[]): number | null {
  for (const field of fields) {
    if (!hasOwn(row, field)) continue;
    const number = toNumber(row[field]);
    if (number != null) return number;
  }
  return null;
}

function hasFractionalCents(value: unknown): boolean {
  const number = toNumber(value);
  if (number == null) return false;
  return Math.abs(number * 100 - Math.round(number * 100)) > FRACTIONAL_EPSILON;
}

function amountFieldWithFractionalCents(row: UnknownRow, fields: string[]): string | null {
  for (const field of fields) {
    if (hasOwn(row, field) && hasFractionalCents(row[field])) return field;
  }
  return null;
}

function nearlyEqual(a: number, b: number, tolerance = MONEY_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFinalizedExpenseStatus(status: string): boolean {
  return FINALIZED_EXPENSE_STATUSES.has(status);
}

function isExcludedStatus(status: string): boolean {
  return EXCLUDED_STATUSES.has(status);
}

function isPendingStatus(status: string): boolean {
  return PENDING_STATUSES.has(status);
}

function isVoidPaymentStatus(status: string): boolean {
  return VOID_PAYMENT_STATUSES.has(status);
}

function issueLink(module: DataQualityModule, id?: string): string | undefined {
  if (!id) return undefined;
  if (module === "projects") return `/projects/${id}?tab=cost`;
  if (module === "expenses") return `/financial/expenses/${id}`;
  if (module === "invoices") return `/financial/invoices/${id}`;
  if (module === "estimates") return `/estimates/${id}`;
  if (module === "labor") return "/labor/entries";
  if (module === "reimbursements") return "/labor/worker-balances";
  return "/settings/company";
}

type IssueBag = DataQualityIssue[];

function pushIssue(issues: IssueBag, issue: DataQualityIssue) {
  issues.push(issue);
}

function pushTableErrors(issues: IssueBag, rows: DataQualityRows) {
  for (const error of rows.tableErrors ?? []) {
    pushIssue(issues, {
      severity: "critical",
      module: error.module,
      entityType: "table",
      entityName: error.table,
      issueCode: "data_quality_table_unavailable",
      message: `${error.table} could not be checked.`,
      currentValue: error.message,
      recommendedAction: "Review the required schema and server-side Supabase access.",
    });
  }
}

function checkProjects(
  issues: IssueBag,
  projects: UnknownRow[],
  snapshots: ProjectSnapshotCheckResult[]
) {
  const snapshotByProject = new Map(snapshots.map((result) => [result.projectId, result]));

  for (const project of projects) {
    const id = rowId(project);
    const name = rowName(project, ["name", "project_name"], "Unnamed project");
    const budget = firstNumber(project, ["budget"]);
    const contractAmount = firstNumber(project, ["contract_amount", "contractAmount"]);
    const status = stringValue(project.status);
    const projectIssues = getProjectContractReviewIssues({ budget, contractAmount });

    if (!name || name === "Unnamed project") {
      pushIssue(issues, {
        severity: "warning",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: "project_missing_name",
        message: "Project is missing a name.",
        recommendedAction: "Open the project and set a clear project name.",
        link: issueLink("projects", id),
      });
    }
    if (!status) {
      pushIssue(issues, {
        severity: "warning",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: "project_missing_status",
        message: "Project is missing a status.",
        recommendedAction: "Open the project and set a valid project status.",
        link: issueLink("projects", id),
      });
    }

    for (const contractIssue of projectIssues) {
      pushIssue(issues, {
        severity: "warning",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: contractIssue.code,
        message: contractIssue.description,
        currentValue: `budget=${budget ?? "missing"}, contract_amount=${contractAmount ?? "missing"}`,
        recommendedAction: "Open Project Financial Review and correct the contract value.",
        link: "/settings/project-financial-review",
      });
    }

    const snapshotResult = id ? snapshotByProject.get(id) : undefined;
    if (!snapshotResult) continue;
    if (!snapshotResult.ok) {
      pushIssue(issues, {
        severity: "critical",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: "project_snapshot_api_failure",
        message: "Project financial snapshot could not be calculated.",
        currentValue: snapshotResult.message,
        recommendedAction: "Open the project cost tab and inspect the snapshot API logs.",
        link: issueLink("projects", id),
      });
      continue;
    }

    const snapshot = snapshotResult.snapshot;
    const componentCost = roundMoney(
      snapshot.expenseCost +
        snapshot.laborCost +
        snapshot.reimbursementCost +
        snapshot.subcontractCost
    );
    if (!Number.isFinite(snapshot.actualCost)) {
      pushIssue(issues, {
        severity: "critical",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: "project_actual_cost_invalid",
        message: "Project snapshot actual cost is not a valid number.",
        currentValue: String(snapshot.actualCost),
        recommendedAction: "Review project financial snapshot data sources.",
        link: issueLink("projects", id),
      });
    } else if (snapshot.actualCost < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: "project_actual_cost_negative",
        message: "Project snapshot actual cost is negative.",
        currentValue: snapshot.actualCost,
        expectedValue: ">= 0",
        recommendedAction: "Review expense, labor, reimbursement, and subcontract source rows.",
        link: issueLink("projects", id),
      });
    } else if (!nearlyEqual(snapshot.actualCost, componentCost)) {
      pushIssue(issues, {
        severity: "critical",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: "project_actual_cost_component_mismatch",
        message: "Project actual cost does not match its component costs.",
        currentValue: snapshot.actualCost,
        expectedValue: componentCost,
        recommendedAction: "Review ProjectFinancialSnapshot component mapping.",
        link: issueLink("projects", id),
      });
    }

    const pendingExpenseCost = snapshot.diagnostics?.pendingExpenseCost ?? 0;
    const pendingReimbursementCost = snapshot.diagnostics?.pendingReimbursementCost ?? 0;
    if (pendingExpenseCost > 0 || pendingReimbursementCost > 0) {
      pushIssue(issues, {
        severity: "warning",
        module: "projects",
        entityType: "project",
        entityId: id,
        entityName: name,
        issueCode: "project_pending_cost_review",
        message: "Project has pending costs that are not included in confirmed actual cost.",
        currentValue: `pendingExpense=${pendingExpenseCost}, pendingReimbursement=${pendingReimbursementCost}`,
        recommendedAction:
          "Review pending expenses or reimbursements before relying on final profit.",
        link: issueLink("projects", id),
      });
    }
  }
}

function groupRowsByStringField(rows: UnknownRow[], field: string): Map<string, UnknownRow[]> {
  const map = new Map<string, UnknownRow[]>();
  for (const row of rows) {
    const key = stringValue(row[field]);
    if (!key) continue;
    const existing = map.get(key) ?? [];
    existing.push(row);
    map.set(key, existing);
  }
  return map;
}

function checkExpenses(issues: IssueBag, expenses: UnknownRow[], expenseLines: UnknownRow[]) {
  const linesByExpense = groupRowsByStringField(expenseLines, "expense_id");

  for (const expense of expenses) {
    const id = rowId(expense);
    const name = rowName(expense, ["vendor", "vendor_name", "merchant", "reference_no"], "Expense");
    const status = normalizeStatus(expense.status);
    const headerAmount = firstNumber(expense, ["amount", "total", "total_amount"]);
    const lines = id ? (linesByExpense.get(id) ?? []) : [];
    const lineSum = roundMoney(
      lines.reduce(
        (sum, line) => sum + (firstNumber(line, ["amount", "total", "total_amount"]) ?? 0),
        0
      )
    );

    const fractionalField = amountFieldWithFractionalCents(expense, [
      "amount",
      "total",
      "total_amount",
    ]);
    if (fractionalField) {
      pushIssue(issues, {
        severity: "warning",
        module: "expenses",
        entityType: "expense",
        entityId: id,
        entityName: name,
        issueCode: "expense_fractional_currency",
        message: `Expense ${fractionalField} has more than two decimal places.`,
        currentValue: issueValue(expense[fractionalField]),
        recommendedAction:
          "Review the source record and ensure UI formats currency to two decimals.",
        link: issueLink("expenses", id),
      });
    }

    for (const line of lines) {
      const lineField = amountFieldWithFractionalCents(line, ["amount", "total", "total_amount"]);
      if (lineField) {
        pushIssue(issues, {
          severity: "warning",
          module: "expenses",
          entityType: "expense_line",
          entityId: rowId(line),
          entityName: name,
          issueCode: "expense_line_fractional_currency",
          message: `Expense line ${lineField} has more than two decimal places.`,
          currentValue: issueValue(line[lineField]),
          recommendedAction: "Review the expense line amount and currency formatting path.",
          link: issueLink("expenses", id),
        });
      }
    }

    if (headerAmount == null && lines.length > 0) {
      pushIssue(issues, {
        severity: isFinalizedExpenseStatus(status) ? "critical" : "warning",
        module: "expenses",
        entityType: "expense",
        entityId: id,
        entityName: name,
        issueCode: "expense_header_amount_missing",
        message: "Expense header amount is missing while line amounts exist.",
        expectedValue: lineSum,
        recommendedAction: "Open the expense and resave the header amount.",
        link: issueLink("expenses", id),
      });
    }

    if (headerAmount != null && lines.length > 0 && !nearlyEqual(headerAmount, lineSum)) {
      pushIssue(issues, {
        severity: isFinalizedExpenseStatus(status) ? "critical" : "warning",
        module: "expenses",
        entityType: "expense",
        entityId: id,
        entityName: name,
        issueCode: "expense_header_line_total_mismatch",
        message: "Expense header amount does not match the sum of expense lines.",
        currentValue: headerAmount,
        expectedValue: lineSum,
        recommendedAction: "Review the expense detail and line items.",
        link: issueLink("expenses", id),
      });
    }

    if (headerAmount != null && lines.length === 0 && !isExcludedStatus(status)) {
      pushIssue(issues, {
        severity: "warning",
        module: "expenses",
        entityType: "expense",
        entityId: id,
        entityName: name,
        issueCode: "expense_header_only_cost",
        message: "Expense has a header amount but no line items.",
        currentValue: headerAmount,
        recommendedAction: "Confirm this header-only expense is intentional.",
        link: issueLink("expenses", id),
      });
    }

    if (isFinalizedExpenseStatus(status)) {
      const hasProject =
        Boolean(stringValue(expense.project_id)) ||
        lines.some((line) => stringValue(line.project_id));
      if (!hasProject) {
        pushIssue(issues, {
          severity: "warning",
          module: "expenses",
          entityType: "expense",
          entityId: id,
          entityName: name,
          issueCode: "finalized_expense_missing_project",
          message: "Finalized expense is missing a project assignment.",
          recommendedAction: "Assign a project or confirm this is overhead.",
          link: issueLink("expenses", id),
        });
      }
    }

    if (isPendingStatus(status) && headerAmount != null && headerAmount > 0) {
      pushIssue(issues, {
        severity: "warning",
        module: "expenses",
        entityType: "expense",
        entityId: id,
        entityName: name,
        issueCode: "expense_pending_review_cost",
        message:
          "Pending or needs-review expense exists and should not be in confirmed actual cost.",
        currentValue: headerAmount,
        recommendedAction: "Review the expense before treating it as confirmed project cost.",
        link: issueLink("expenses", id),
      });
    }

    if (headerAmount != null && headerAmount < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "expenses",
        entityType: "expense",
        entityId: id,
        entityName: name,
        issueCode: "expense_negative_amount",
        message: "Expense amount is negative.",
        currentValue: headerAmount,
        recommendedAction: "Confirm whether this should be a credit/refund workflow.",
        link: issueLink("expenses", id),
      });
    }
  }
}

function checkInvoices(
  issues: IssueBag,
  invoices: UnknownRow[],
  invoiceItems: UnknownRow[],
  invoicePayments: UnknownRow[]
) {
  const itemsByInvoice = groupRowsByStringField(invoiceItems, "invoice_id");
  const paymentsByInvoice = groupRowsByStringField(invoicePayments, "invoice_id");

  for (const invoice of invoices) {
    const id = rowId(invoice);
    const name = rowName(invoice, ["invoice_no", "invoice_number", "number"], "Invoice");
    const status = normalizeStatus(invoice.status);
    const total = firstNumber(invoice, ["total", "amount", "grand_total"]);
    const subtotal = firstNumber(invoice, ["subtotal"]);
    const storedPaid = firstNumber(invoice, ["paid_total", "paid_amount", "paidAmount"]);
    const storedBalance = firstNumber(invoice, ["balance_due", "amount_due", "open_ar"]);
    const items = id ? (itemsByInvoice.get(id) ?? []) : [];
    const payments = id ? (paymentsByInvoice.get(id) ?? []) : [];
    const itemSum = roundMoney(
      items.reduce(
        (sum, item) => sum + (firstNumber(item, ["amount", "total", "line_total"]) ?? 0),
        0
      )
    );
    const postedPaymentSum = roundMoney(
      payments
        .filter((payment) => !isVoidPaymentStatus(normalizeStatus(payment.status)))
        .reduce((sum, payment) => sum + (firstNumber(payment, ["amount", "total"]) ?? 0), 0)
    );
    const voidPaymentSum = roundMoney(
      payments
        .filter((payment) => isVoidPaymentStatus(normalizeStatus(payment.status)))
        .reduce((sum, payment) => sum + (firstNumber(payment, ["amount", "total"]) ?? 0), 0)
    );
    const paidAmount = storedPaid ?? postedPaymentSum;

    const fractionalField = amountFieldWithFractionalCents(invoice, [
      "total",
      "subtotal",
      "tax_amount",
      "paid_total",
      "paid_amount",
      "balance_due",
      "amount_due",
    ]);
    if (fractionalField) {
      pushIssue(issues, {
        severity: "warning",
        module: "invoices",
        entityType: "invoice",
        entityId: id,
        entityName: name,
        issueCode: "invoice_fractional_currency",
        message: `Invoice ${fractionalField} has more than two decimal places.`,
        currentValue: issueValue(invoice[fractionalField]),
        recommendedAction: "Review invoice calculation and currency formatting.",
        link: issueLink("invoices", id),
      });
    }

    for (const item of items) {
      const quantity = firstNumber(item, ["qty", "quantity"]);
      const rate = firstNumber(item, ["rate", "unit_price", "unitPrice", "unit_cost"]);
      const amount = firstNumber(item, ["amount", "total", "line_total"]);
      if (quantity != null && rate != null && amount != null) {
        const expected = roundMoney(quantity * rate);
        if (!nearlyEqual(amount, expected)) {
          pushIssue(issues, {
            severity: "warning",
            module: "invoices",
            entityType: "invoice_item",
            entityId: rowId(item),
            entityName: name,
            issueCode: "invoice_item_amount_mismatch",
            message: "Invoice item amount does not match quantity times rate.",
            currentValue: amount,
            expectedValue: expected,
            recommendedAction: "Open the invoice editor and recalculate the line item.",
            link: issueLink("invoices", id),
          });
        }
      }
      const itemFractionalField = amountFieldWithFractionalCents(item, [
        "amount",
        "total",
        "line_total",
        "rate",
        "unit_price",
        "unit_cost",
      ]);
      if (itemFractionalField) {
        pushIssue(issues, {
          severity: "warning",
          module: "invoices",
          entityType: "invoice_item",
          entityId: rowId(item),
          entityName: name,
          issueCode: "invoice_item_fractional_currency",
          message: `Invoice item ${itemFractionalField} has more than two decimal places.`,
          currentValue: issueValue(item[itemFractionalField]),
          recommendedAction: "Confirm the UI rounds currency output to two decimals.",
          link: issueLink("invoices", id),
        });
      }
    }

    if (subtotal != null && items.length > 0 && !nearlyEqual(subtotal, itemSum)) {
      pushIssue(issues, {
        severity: "critical",
        module: "invoices",
        entityType: "invoice",
        entityId: id,
        entityName: name,
        issueCode: "invoice_subtotal_item_sum_mismatch",
        message: "Invoice subtotal does not match the sum of invoice items.",
        currentValue: subtotal,
        expectedValue: itemSum,
        recommendedAction: "Open the invoice and recalculate/save it.",
        link: issueLink("invoices", id),
      });
    }

    if (total != null && paidAmount != null && paidAmount > total + MONEY_TOLERANCE) {
      pushIssue(issues, {
        severity: "critical",
        module: "invoices",
        entityType: "invoice",
        entityId: id,
        entityName: name,
        issueCode: "invoice_paid_exceeds_total",
        message: "Invoice paid amount is greater than invoice total.",
        currentValue: paidAmount,
        expectedValue: total,
        recommendedAction: "Review invoice payments and void/reversal handling.",
        link: issueLink("invoices", id),
      });
    }

    if (total != null && paidAmount != null && storedBalance != null) {
      const expectedBalance = roundMoney(total - paidAmount);
      if (!nearlyEqual(storedBalance, expectedBalance)) {
        pushIssue(issues, {
          severity: "critical",
          module: "invoices",
          entityType: "invoice",
          entityId: id,
          entityName: name,
          issueCode: "invoice_balance_due_mismatch",
          message: "Invoice balance due does not equal total minus paid amount.",
          currentValue: storedBalance,
          expectedValue: expectedBalance,
          recommendedAction: "Review invoice payment sync and derived fields.",
          link: issueLink("invoices", id),
        });
      }
    }

    if (
      PAID_STATUSES.has(status) &&
      (storedBalance ?? (total ?? 0) - (paidAmount ?? 0)) > MONEY_TOLERANCE
    ) {
      pushIssue(issues, {
        severity: "critical",
        module: "invoices",
        entityType: "invoice",
        entityId: id,
        entityName: name,
        issueCode: "paid_invoice_has_open_balance",
        message: "Invoice is marked paid but still has an open balance.",
        currentValue: storedBalance ?? (total ?? 0) - (paidAmount ?? 0),
        expectedValue: 0,
        recommendedAction: "Review invoice status and payments.",
        link: issueLink("invoices", id),
      });
    }

    if (UNPAID_STATUSES.has(status) && (paidAmount ?? 0) > MONEY_TOLERANCE) {
      pushIssue(issues, {
        severity: "warning",
        module: "invoices",
        entityType: "invoice",
        entityId: id,
        entityName: name,
        issueCode: "unpaid_invoice_has_payments",
        message: "Invoice is marked unpaid/draft/open but has payments.",
        currentValue: paidAmount,
        recommendedAction: "Review invoice status and payment sync.",
        link: issueLink("invoices", id),
      });
    }

    if (
      voidPaymentSum > 0 &&
      storedPaid != null &&
      storedPaid >= postedPaymentSum + voidPaymentSum - MONEY_TOLERANCE
    ) {
      pushIssue(issues, {
        severity: "warning",
        module: "invoices",
        entityType: "invoice",
        entityId: id,
        entityName: name,
        issueCode: "void_invoice_payment_may_be_counted",
        message: "Invoice has void/cancelled payments that may be included in paid amount.",
        currentValue: storedPaid,
        expectedValue: postedPaymentSum,
        recommendedAction: "Confirm void/cancelled payments are excluded from paid totals.",
        link: issueLink("invoices", id),
      });
    }
  }
}

function checkEstimates(issues: IssueBag, estimates: UnknownRow[], estimateItems: UnknownRow[]) {
  const itemsByEstimate = groupRowsByStringField(estimateItems, "estimate_id");

  for (const estimate of estimates) {
    const id = rowId(estimate);
    const name = rowName(
      estimate,
      ["estimate_no", "estimate_number", "number", "title"],
      "Estimate"
    );
    const total = firstNumber(estimate, ["total", "amount", "grand_total"]);
    const subtotal = firstNumber(estimate, ["subtotal"]);
    const items = id ? (itemsByEstimate.get(id) ?? []) : [];
    const itemSum = roundMoney(
      items.reduce(
        (sum, item) => sum + (firstNumber(item, ["amount", "total", "line_total"]) ?? 0),
        0
      )
    );

    const fractionalField = amountFieldWithFractionalCents(estimate, [
      "total",
      "subtotal",
      "tax_amount",
      "amount",
    ]);
    if (fractionalField) {
      pushIssue(issues, {
        severity: "warning",
        module: "estimates",
        entityType: "estimate",
        entityId: id,
        entityName: name,
        issueCode: "estimate_fractional_currency",
        message: `Estimate ${fractionalField} has more than two decimal places.`,
        currentValue: issueValue(estimate[fractionalField]),
        recommendedAction: "Review estimate display paths for shared currency formatting.",
        link: issueLink("estimates", id),
      });
    }

    for (const item of items) {
      const quantity = firstNumber(item, ["qty", "quantity"]);
      const rate = firstNumber(item, ["rate", "unit_price", "unitPrice", "unit_cost"]);
      const amount = firstNumber(item, ["amount", "total", "line_total"]);
      if (quantity != null && rate != null && amount != null) {
        const expected = roundMoney(quantity * rate);
        if (!nearlyEqual(amount, expected)) {
          pushIssue(issues, {
            severity: "warning",
            module: "estimates",
            entityType: "estimate_item",
            entityId: rowId(item),
            entityName: name,
            issueCode: "estimate_item_amount_mismatch",
            message: "Estimate item amount does not match quantity times rate.",
            currentValue: amount,
            expectedValue: expected,
            recommendedAction: "Open the estimate editor and recalculate the line item.",
            link: issueLink("estimates", id),
          });
        }
      }
      const itemFractionalField = amountFieldWithFractionalCents(item, [
        "amount",
        "total",
        "line_total",
        "rate",
        "unit_price",
        "unit_cost",
      ]);
      if (itemFractionalField) {
        pushIssue(issues, {
          severity: "warning",
          module: "estimates",
          entityType: "estimate_item",
          entityId: rowId(item),
          entityName: name,
          issueCode: "estimate_item_fractional_currency",
          message: `Estimate item ${itemFractionalField} has more than two decimal places.`,
          currentValue: issueValue(item[itemFractionalField]),
          recommendedAction: "Confirm estimate UI rounds currency output to two decimals.",
          link: issueLink("estimates", id),
        });
      }
    }

    if (subtotal != null && items.length > 0 && !nearlyEqual(subtotal, itemSum)) {
      pushIssue(issues, {
        severity: "warning",
        module: "estimates",
        entityType: "estimate",
        entityId: id,
        entityName: name,
        issueCode: "estimate_subtotal_item_sum_mismatch",
        message: "Estimate subtotal does not match the sum of estimate items.",
        currentValue: subtotal,
        expectedValue: itemSum,
        recommendedAction: "Open the estimate and recalculate/save it.",
        link: issueLink("estimates", id),
      });
    }

    if (total != null && total < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "estimates",
        entityType: "estimate",
        entityId: id,
        entityName: name,
        issueCode: "estimate_negative_total",
        message: "Estimate total is negative.",
        currentValue: total,
        expectedValue: ">= 0",
        recommendedAction: "Review estimate items and total calculation.",
        link: issueLink("estimates", id),
      });
    }
  }
}

function checkLaborAndWorkers(
  issues: IssueBag,
  laborEntries: UnknownRow[],
  workerPayments: UnknownRow[],
  workerAdvances: UnknownRow[]
) {
  for (const entry of laborEntries) {
    const id = rowId(entry);
    const status = normalizeStatus(entry.status);
    const hours = firstNumber(entry, ["hours", "total_hours"]);
    const rate = firstNumber(entry, ["rate", "hourly_rate", "daily_rate"]);
    const amount = firstNumber(entry, ["amount", "cost_amount", "total", "total_cost"]);

    if (hours != null && hours < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "labor",
        entityType: "labor_entry",
        entityId: id,
        issueCode: "labor_negative_hours",
        message: "Labor entry has negative hours.",
        currentValue: hours,
        expectedValue: ">= 0",
        recommendedAction: "Review the labor entry.",
        link: issueLink("labor", id),
      });
    }
    if (rate != null && rate < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "labor",
        entityType: "labor_entry",
        entityId: id,
        issueCode: "labor_negative_rate",
        message: "Labor entry has a negative rate.",
        currentValue: rate,
        expectedValue: ">= 0",
        recommendedAction: "Review the labor entry.",
        link: issueLink("labor", id),
      });
    }
    if (amount != null && amount < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "labor",
        entityType: "labor_entry",
        entityId: id,
        issueCode: "labor_negative_amount",
        message: "Labor entry has a negative amount.",
        currentValue: amount,
        expectedValue: ">= 0",
        recommendedAction: "Review the labor entry.",
        link: issueLink("labor", id),
      });
    }
    if (hours != null && rate != null && amount != null) {
      const expected = roundMoney(hours * rate);
      if (!nearlyEqual(amount, expected)) {
        pushIssue(issues, {
          severity: "warning",
          module: "labor",
          entityType: "labor_entry",
          entityId: id,
          issueCode: "labor_amount_mismatch",
          message: "Labor amount does not match hours times rate.",
          currentValue: amount,
          expectedValue: expected,
          recommendedAction: "Review labor entry calculation rules.",
          link: issueLink("labor", id),
        });
      }
    }
    if (isExcludedStatus(status) && (amount ?? 0) > MONEY_TOLERANCE) {
      pushIssue(issues, {
        severity: "warning",
        module: "labor",
        entityType: "labor_entry",
        entityId: id,
        issueCode: "excluded_labor_has_amount",
        message:
          "Void/rejected labor entry has a positive amount; confirm it is excluded from project cost.",
        currentValue: amount,
        recommendedAction: "Confirm snapshot and payroll logic exclude this entry.",
        link: issueLink("labor", id),
      });
    }
  }

  for (const payment of workerPayments) {
    const id = rowId(payment);
    const amount = firstNumber(payment, ["amount", "total", "total_amount"]);
    if (amount === 0) {
      pushIssue(issues, {
        severity: "warning",
        module: "labor",
        entityType: "worker_payment",
        entityId: id,
        issueCode: "worker_payment_zero_amount",
        message: "Worker payment amount is zero.",
        currentValue: amount,
        recommendedAction: "Confirm this payment record is intentional.",
        link: "/labor/payments",
      });
    } else if (amount != null && amount < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "labor",
        entityType: "worker_payment",
        entityId: id,
        issueCode: "worker_payment_negative_amount",
        message: "Worker payment amount is negative.",
        currentValue: amount,
        recommendedAction: "Review worker payment data.",
        link: "/labor/payments",
      });
    }
  }

  for (const advance of workerAdvances) {
    const id = rowId(advance);
    const amount = firstNumber(advance, ["amount", "total", "total_amount"]);
    if (amount != null && amount < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "labor",
        entityType: "worker_advance",
        entityId: id,
        issueCode: "worker_advance_negative_amount",
        message: "Worker advance amount is negative.",
        currentValue: amount,
        recommendedAction: "Review worker advance data.",
        link: "/labor/worker-balances",
      });
    }
  }
}

function checkReimbursements(
  issues: IssueBag,
  reimbursements: UnknownRow[],
  expenseLines: UnknownRow[]
) {
  const linkedExpenseIds = new Set(
    expenseLines
      .flatMap((line) => [
        stringValue(line.linked_reimbursement_id),
        stringValue(line.reimbursement_id),
        stringValue(line.source_id),
      ])
      .filter(Boolean)
  );

  for (const reimbursement of reimbursements) {
    const id = rowId(reimbursement);
    const status = normalizeStatus(reimbursement.status);
    const amount = firstNumber(reimbursement, ["amount", "total_amount", "total"]);
    const linkedExpenseId =
      stringValue(reimbursement.expense_id) ||
      stringValue(reimbursement.linked_expense_id) ||
      stringValue(reimbursement.source_expense_id) ||
      stringValue(reimbursement.converted_expense_id);

    if (amount == null) {
      pushIssue(issues, {
        severity: PAID_STATUSES.has(status) ? "critical" : "warning",
        module: "reimbursements",
        entityType: "worker_reimbursement",
        entityId: id,
        issueCode: "reimbursement_amount_missing",
        message: "Worker reimbursement amount is missing.",
        recommendedAction: "Open the reimbursement and correct the amount.",
        link: issueLink("reimbursements", id),
      });
    } else if (amount < 0) {
      pushIssue(issues, {
        severity: "critical",
        module: "reimbursements",
        entityType: "worker_reimbursement",
        entityId: id,
        issueCode: "reimbursement_negative_amount",
        message: "Worker reimbursement amount is negative.",
        currentValue: amount,
        recommendedAction: "Review reimbursement data.",
        link: issueLink("reimbursements", id),
      });
    }

    if ((isPendingStatus(status) || status === "approved") && (amount ?? 0) > 0) {
      pushIssue(issues, {
        severity: "warning",
        module: "reimbursements",
        entityType: "worker_reimbursement",
        entityId: id,
        issueCode: "reimbursement_pending_committed",
        message:
          "Pending or approved reimbursement exists; it should be payable/committed but not confirmed actual cost until finalized.",
        currentValue: amount,
        recommendedAction: "Review reimbursement status before relying on final project profit.",
        link: issueLink("reimbursements", id),
      });
    }

    if (linkedExpenseId || (id && linkedExpenseIds.has(id))) {
      pushIssue(issues, {
        severity: "warning",
        module: "reimbursements",
        entityType: "worker_reimbursement",
        entityId: id,
        issueCode: "reimbursement_linked_expense_dedupe_risk",
        message: "Reimbursement is linked to an expense path and must be counted only once.",
        currentValue: linkedExpenseId || id,
        recommendedAction: "Confirm ProjectFinancialSnapshot reimbursement dedupe diagnostics.",
        link: issueLink("reimbursements", id),
      });
    }
  }
}

function checkCompanyProfiles(issues: IssueBag, profiles: UnknownRow[]) {
  for (const profile of profiles) {
    const id = rowId(profile);
    const fieldsWithMarkers = Object.entries(profile)
      .filter(([, value]) => typeof value === "string" && /E2E-ST|E2E-ZIP|test marker/i.test(value))
      .map(([field]) => field)
      .sort();

    if (fieldsWithMarkers.length > 0) {
      pushIssue(issues, {
        severity: "warning",
        module: "company-profile",
        entityType: "company_profile",
        entityId: id,
        entityName: rowName(profile, ["org_name", "company_name", "legal_name"], "Company profile"),
        issueCode: "company_profile_e2e_marker",
        message: "Company profile contains test marker data.",
        currentValue: `Fields: ${fieldsWithMarkers.join(", ")}`,
        recommendedAction: "Update Settings -> Company Profile with correct production values.",
        link: "/settings/company",
      });
    }

    const companyName =
      stringValue(profile.org_name) ||
      stringValue(profile.company_name) ||
      stringValue(profile.legal_name);
    if (!companyName) {
      pushIssue(issues, {
        severity: "warning",
        module: "company-profile",
        entityType: "company_profile",
        entityId: id,
        issueCode: "company_profile_missing_name",
        message: "Company profile is missing a company name.",
        recommendedAction: "Update Settings -> Company Profile.",
        link: "/settings/company",
      });
    }
  }
}

function moduleStatus(critical: number, warning: number): DataQualityStatus {
  if (critical > 0) return "critical";
  if (warning > 0) return "warning";
  return "ok";
}

function buildModuleSummaries(
  rows: DataQualityRows,
  issues: DataQualityIssue[]
): DataQualityModuleSummary[] {
  const checkedByModule: Record<DataQualityModule, number> = {
    projects: rows.projects?.length ?? 0,
    expenses: rows.expenses?.length ?? 0,
    invoices: rows.invoices?.length ?? 0,
    estimates: rows.estimates?.length ?? 0,
    labor:
      (rows.laborEntries?.length ?? 0) +
      (rows.workerPayments?.length ?? 0) +
      (rows.workerAdvances?.length ?? 0),
    reimbursements: rows.workerReimbursements?.length ?? 0,
    "company-profile": rows.companyProfiles?.length ?? 0,
  };

  return (Object.keys(MODULE_LABELS) as DataQualityModule[]).map((module) => {
    const moduleIssues = issues.filter((issue) => issue.module === module);
    const critical = moduleIssues.filter((issue) => issue.severity === "critical").length;
    const warning = moduleIssues.filter((issue) => issue.severity === "warning").length;
    const info = moduleIssues.filter((issue) => issue.severity === "info").length;
    return {
      module,
      label: MODULE_LABELS[module],
      checked: checkedByModule[module],
      critical,
      warning,
      info,
      status: moduleStatus(critical, warning),
    };
  });
}

function limitIssuesByModule(issues: DataQualityIssue[]): DataQualityIssue[] {
  const counts = new Map<DataQualityModule, number>();
  return issues.filter((issue) => {
    const count = counts.get(issue.module) ?? 0;
    if (count >= MAX_ISSUES_PER_MODULE) return false;
    counts.set(issue.module, count + 1);
    return true;
  });
}

export function buildDataQualityReport(rows: DataQualityRows): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  pushTableErrors(issues, rows);
  checkProjects(issues, rows.projects ?? [], rows.projectSnapshots ?? []);
  checkExpenses(issues, rows.expenses ?? [], rows.expenseLines ?? []);
  checkInvoices(issues, rows.invoices ?? [], rows.invoiceItems ?? [], rows.invoicePayments ?? []);
  checkEstimates(issues, rows.estimates ?? [], rows.estimateItems ?? []);
  checkLaborAndWorkers(
    issues,
    rows.laborEntries ?? [],
    rows.workerPayments ?? [],
    rows.workerAdvances ?? []
  );
  checkReimbursements(issues, rows.workerReimbursements ?? [], rows.expenseLines ?? []);
  checkCompanyProfiles(issues, rows.companyProfiles ?? []);

  const modules = buildModuleSummaries(rows, issues);
  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const warning = issues.filter((issue) => issue.severity === "warning").length;
  const info = issues.filter((issue) => issue.severity === "info").length;
  const returnedIssues = limitIssuesByModule(issues);
  const status = moduleStatus(critical, warning);

  return {
    ok: critical === 0,
    checkedAt: rows.checkedAt ?? new Date().toISOString(),
    summary: {
      status,
      critical,
      warning,
      info,
      totalIssues: issues.length,
      returnedIssues: returnedIssues.length,
      projectsChecked: rows.projects?.length ?? 0,
      expensesChecked: rows.expenses?.length ?? 0,
      invoicesChecked: rows.invoices?.length ?? 0,
      estimatesChecked: rows.estimates?.length ?? 0,
      laborChecked: rows.laborEntries?.length ?? 0,
      reimbursementsChecked: rows.workerReimbursements?.length ?? 0,
      companyProfileChecked: rows.companyProfiles?.length ?? 0,
    },
    modules,
    issues: returnedIssues,
  };
}
