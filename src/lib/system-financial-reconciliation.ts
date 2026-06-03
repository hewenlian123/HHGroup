import { getProjectContractReviewIssues } from "@/lib/financial/project-financial-review";
import type { ProjectFinancialSnapshot } from "@/lib/financial/project-financial-snapshot";
import { computeSummary, type EstimateItemRow } from "@/lib/estimates-db";
import type { FinanceOwnerDashboard } from "@/lib/finance-owner-dashboard";
import { redactSensitiveText, safeErrorMessage } from "@/lib/system-response-safety";
import type { SystemIntegrityScanReport } from "@/lib/system-integrity-scan";
import type { WorkerBalanceRow } from "@/lib/worker-balances-list";

export type SystemFinancialReconciliationStatus = "pass" | "warning" | "fail" | "error";
export type SystemFinancialReconciliationSeverity = "info" | "low" | "medium" | "high" | "critical";
export type SystemFinancialReconciliationCategory =
  | "invoice_reconciliation"
  | "estimate_reconciliation"
  | "project_snapshot"
  | "worker_balance"
  | "financial_marker_impact";

export type SystemFinancialReconciliationIssue = {
  severity: SystemFinancialReconciliationSeverity;
  category: SystemFinancialReconciliationCategory;
  table: string;
  id: string;
  message: string;
  evidence: Record<string, unknown>;
  recommendedAction: string;
  autoFixAvailable: false;
};

export type SystemFinancialReconciliationSection = {
  id: string;
  title: string;
  status: SystemFinancialReconciliationStatus;
  issues: SystemFinancialReconciliationIssue[];
};

export type SystemFinancialReconciliationReport = {
  status: SystemFinancialReconciliationStatus;
  generatedAt: string;
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  sections: SystemFinancialReconciliationSection[];
};

type SupabaseErrorLike = { message?: string; code?: string } | null;
type SupabaseReadResult = {
  data: unknown[] | null;
  error: SupabaseErrorLike;
};
type SupabaseSelectBuilder = PromiseLike<SupabaseReadResult> & {
  limit: (count: number) => PromiseLike<SupabaseReadResult>;
};

export type SystemFinancialReconciliationReadClient = {
  from: (table: string) => {
    select: (columns?: string) => SupabaseSelectBuilder;
  };
};

export type SystemFinancialReconciliationOptions = {
  generatedAt?: string;
  rowLimit?: number;
  projectLimit?: number;
  maxIssuesPerSection?: number;
  projectSnapshotLoader?: (projectId: string) => Promise<ProjectFinancialSnapshot>;
  ownerDashboardLoader?: () => Promise<FinanceOwnerDashboard>;
  workerBalanceLoader?: () => Promise<WorkerBalanceRow[]>;
  integrityScanLoader?: () => Promise<SystemIntegrityScanReport>;
};

type UnknownRow = Record<string, unknown>;

type TableRead = {
  table: string;
  rows: UnknownRow[];
  missing: boolean;
  error?: string;
};

type SectionBuild = {
  section: SystemFinancialReconciliationSection;
  allIssues: SystemFinancialReconciliationIssue[];
};

const MONEY_TOLERANCE = 0.01;
const DEFAULT_ROW_LIMIT = 500;
const DEFAULT_PROJECT_LIMIT = 40;
const DEFAULT_MAX_ISSUES_PER_SECTION = 10;

const FINANCIAL_TABLES = [
  "projects",
  "invoices",
  "invoice_items",
  "invoice_payments",
  "payments_received",
  "estimates",
  "estimate_items",
  "estimate_meta",
  "estimate_payment_schedule_items",
  "worker_reimbursements",
  "labor_workers",
  "workers",
  "worker_payments",
  "worker_advances",
  "labor_entries",
  "expenses",
  "expense_lines",
] as const;

const STATUS_EXCLUDED_FROM_AR = new Set(["draft", "void", "voided", "cancelled", "canceled"]);
const PAYMENT_VOID_STATUSES = new Set(["void", "voided", "cancelled", "canceled", "rejected"]);

function normalizeStatus(value: unknown): string {
  return String(value ?? "")
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

function toNullableMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function moneyDelta(a: number, b: number): number {
  return Math.round((a - b) * 100) / 100;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= MONEY_TOLERANCE;
}

function rowId(row: UnknownRow): string {
  const id = row.id;
  return typeof id === "string" && id.trim() ? id.trim() : "unknown";
}

function relationId(row: UnknownRow, field: string): string {
  const value = row[field];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isMissingTableError(error: SupabaseErrorLike): boolean {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation.*does not exist|does not exist|not found|not exist|schema cache/i.test(message)
  );
}

function severityRank(severity: SystemFinancialReconciliationSeverity): number {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "medium") return 2;
  if (severity === "low") return 3;
  return 4;
}

function statusFromIssues(
  issues: SystemFinancialReconciliationIssue[]
): Exclude<SystemFinancialReconciliationStatus, "error"> {
  if (issues.some((issue) => issue.severity === "critical" || issue.severity === "high")) {
    return "fail";
  }
  if (issues.some((issue) => issue.severity === "medium" || issue.severity === "low")) {
    return "warning";
  }
  return "pass";
}

function sanitizeEvidence(evidence: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(evidence).map(([key, value]) => {
      if (typeof value === "string") return [key, redactSensitiveText(value)];
      if (Array.isArray(value)) {
        return [
          key,
          value.map((item) => {
            if (typeof item === "string") return redactSensitiveText(item);
            if (item && typeof item === "object") {
              return sanitizeEvidence(item as Record<string, unknown>);
            }
            return item;
          }),
        ];
      }
      if (value && typeof value === "object") {
        return [key, sanitizeEvidence(value as Record<string, unknown>)];
      }
      return [key, value];
    })
  );
}

function makeIssue(
  input: Omit<SystemFinancialReconciliationIssue, "evidence" | "autoFixAvailable"> & {
    evidence?: Record<string, unknown>;
  }
): SystemFinancialReconciliationIssue {
  return {
    ...input,
    message: redactSensitiveText(input.message),
    evidence: sanitizeEvidence(input.evidence ?? {}),
    recommendedAction: redactSensitiveText(input.recommendedAction),
    autoFixAvailable: false,
  };
}

function makeSection(
  id: string,
  title: string,
  issues: SystemFinancialReconciliationIssue[],
  maxIssues: number,
  statusOverride?: "error"
): SectionBuild {
  return {
    allIssues: issues,
    section: {
      id,
      title,
      status: statusOverride ?? statusFromIssues(issues),
      issues: [...issues]
        .sort((a, b) => {
          const severityDelta = severityRank(a.severity) - severityRank(b.severity);
          if (severityDelta !== 0) return severityDelta;
          return `${a.table}:${a.id}:${a.category}:${a.message}`.localeCompare(
            `${b.table}:${b.id}:${b.category}:${b.message}`
          );
        })
        .slice(0, maxIssues),
    },
  };
}

function summarize(
  issues: SystemFinancialReconciliationIssue[]
): SystemFinancialReconciliationReport["summary"] {
  return {
    totalIssues: issues.length,
    critical: issues.filter((issue) => issue.severity === "critical").length,
    high: issues.filter((issue) => issue.severity === "high").length,
    medium: issues.filter((issue) => issue.severity === "medium").length,
    low: issues.filter((issue) => issue.severity === "low").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

async function loadTable(
  client: SystemFinancialReconciliationReadClient,
  table: string,
  limit: number
): Promise<TableRead> {
  try {
    const { data, error } = await client.from(table).select("*").limit(limit);
    if (error) {
      return {
        table,
        rows: [],
        missing: isMissingTableError(error),
        error: isMissingTableError(error)
          ? undefined
          : safeErrorMessage(error.message, `${table} could not be read.`),
      };
    }
    return {
      table,
      rows: Array.isArray(data) ? (data as UnknownRow[]) : [],
      missing: false,
    };
  } catch (error) {
    return {
      table,
      rows: [],
      missing: false,
      error: safeErrorMessage(error, `${table} could not be read.`),
    };
  }
}

function tableErrors(
  tables: Map<string, TableRead>,
  names: string[],
  category: SystemFinancialReconciliationCategory
): SystemFinancialReconciliationIssue[] {
  return names.flatMap((table) => {
    const read = tables.get(table);
    if (!read?.error) return [];
    return [
      makeIssue({
        severity: "critical",
        category,
        table,
        id: `${table}:read-error`,
        message: `${table} could not be checked.`,
        evidence: { table, error: read.error },
        recommendedAction: "Review server-side Supabase read access before trusting this scan.",
      }),
    ];
  });
}

function rowsFor(tables: Map<string, TableRead>, table: string): UnknownRow[] {
  return tables.get(table)?.rows ?? [];
}

function groupBy(rows: UnknownRow[], field: string): Map<string, UnknownRow[]> {
  const grouped = new Map<string, UnknownRow[]>();
  for (const row of rows) {
    const key = relationId(row, field);
    if (!key) continue;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

function invoiceLineAmount(row: UnknownRow): number {
  const storedAmount = toNullableMoney(row.amount);
  if (storedAmount != null) return storedAmount;
  return toMoney(toMoney(row.quantity ?? row.qty) * toMoney(row.unit_price));
}

function isVoidPayment(row: UnknownRow): boolean {
  return PAYMENT_VOID_STATUSES.has(normalizeStatus(row.status));
}

function activePaymentRows(rows: UnknownRow[]): UnknownRow[] {
  return rows.filter((row) => !isVoidPayment(row));
}

function uniqueInvoicePaymentRows(rows: UnknownRow[]): UnknownRow[] {
  const seenPaymentReceivedIds = new Set<string>();
  const unique: UnknownRow[] = [];
  for (const row of rows) {
    const paymentReceivedId = relationId(row, "payment_received_id");
    if (paymentReceivedId) {
      const key = `${relationId(row, "invoice_id")}:${paymentReceivedId}`;
      if (seenPaymentReceivedIds.has(key)) continue;
      seenPaymentReceivedIds.add(key);
    }
    unique.push(row);
  }
  return unique;
}

function buildInvoiceIssues(tables: Map<string, TableRead>): {
  statusOverride?: "error";
  issues: SystemFinancialReconciliationIssue[];
} {
  const errorIssues = tableErrors(
    tables,
    ["invoices", "invoice_items", "invoice_payments", "payments_received"],
    "invoice_reconciliation"
  );
  if (errorIssues.length > 0) return { statusOverride: "error", issues: errorIssues };

  const invoices = rowsFor(tables, "invoices");
  const itemsByInvoice = groupBy(rowsFor(tables, "invoice_items"), "invoice_id");
  const paymentsByInvoice = groupBy(rowsFor(tables, "invoice_payments"), "invoice_id");
  const paymentsReceivedByInvoice = groupBy(rowsFor(tables, "payments_received"), "invoice_id");
  const issues: SystemFinancialReconciliationIssue[] = [];

  for (const [invoiceId, rows] of paymentsByInvoice.entries()) {
    const linkedCounts = new Map<string, number>();
    for (const row of activePaymentRows(rows)) {
      const paymentReceivedId = relationId(row, "payment_received_id");
      if (!paymentReceivedId) continue;
      linkedCounts.set(paymentReceivedId, (linkedCounts.get(paymentReceivedId) ?? 0) + 1);
    }
    for (const [paymentReceivedId, count] of linkedCounts.entries()) {
      if (count <= 1) continue;
      issues.push(
        makeIssue({
          severity: "high",
          category: "invoice_reconciliation",
          table: "invoices",
          id: invoiceId,
          message: "Invoice has duplicate invoice payment rows linked to one payment received row.",
          evidence: { invoiceId, paymentReceivedId, duplicateCount: count },
          recommendedAction:
            "Review invoice_payments/payment_received linkage before relying on paid totals.",
        })
      );
    }
  }

  for (const invoice of invoices) {
    const invoiceId = rowId(invoice);
    const status = normalizeStatus(invoice.status);
    const excludedFromAr = STATUS_EXCLUDED_FROM_AR.has(status);
    const itemRows = itemsByInvoice.get(invoiceId) ?? [];
    const lineSubtotal = toMoney(itemRows.reduce((sum, row) => sum + invoiceLineAmount(row), 0));
    const storedSubtotal = toNullableMoney(invoice.subtotal);
    const taxAmount = toMoney(invoice.tax_amount);
    const storedTotal = toMoney(invoice.total);
    const totalFromLines = toMoney(lineSubtotal + taxAmount);

    if (storedSubtotal != null && !nearlyEqual(storedSubtotal, lineSubtotal)) {
      issues.push(
        makeIssue({
          severity: "high",
          category: "invoice_reconciliation",
          table: "invoices",
          id: invoiceId,
          message: "Invoice stored subtotal does not match invoice line items.",
          evidence: {
            storedSubtotal,
            lineSubtotal,
            delta: moneyDelta(storedSubtotal, lineSubtotal),
            lineCount: itemRows.length,
          },
          recommendedAction:
            "Review invoice line items and stored totals before relying on AR reporting.",
        })
      );
    }

    if (!nearlyEqual(storedTotal, totalFromLines)) {
      issues.push(
        makeIssue({
          severity: "high",
          category: "invoice_reconciliation",
          table: "invoices",
          id: invoiceId,
          message: "Invoice stored total does not match line items plus tax.",
          evidence: {
            storedTotal,
            expectedTotal: totalFromLines,
            lineSubtotal,
            taxAmount,
            delta: moneyDelta(storedTotal, totalFromLines),
          },
          recommendedAction: "Review invoice item math and tax before relying on invoiced totals.",
        })
      );
    }

    const activePayments = activePaymentRows(paymentsByInvoice.get(invoiceId) ?? []);
    const uniquePayments = uniqueInvoicePaymentRows(activePayments);
    const invoicePaymentPaid = toMoney(
      uniquePayments.reduce((sum, row) => sum + toMoney(row.amount), 0)
    );
    const paymentsReceivedPaid = toMoney(
      activePaymentRows(paymentsReceivedByInvoice.get(invoiceId) ?? []).reduce(
        (sum, row) => sum + toMoney(row.amount),
        0
      )
    );
    const storedPaid = toMoney(invoice.paid_total);
    const storedBalance = toMoney(invoice.balance_due);
    const expectedBalance = excludedFromAr
      ? 0
      : Math.max(0, toMoney(storedTotal - invoicePaymentPaid));

    if (!excludedFromAr && !nearlyEqual(storedPaid, invoicePaymentPaid)) {
      issues.push(
        makeIssue({
          severity: "high",
          category: "invoice_reconciliation",
          table: "invoices",
          id: invoiceId,
          message: "Invoice stored paid total does not match invoice payments.",
          evidence: {
            storedPaid,
            invoicePaymentPaid,
            delta: moneyDelta(storedPaid, invoicePaymentPaid),
            activePaymentRows: activePayments.length,
            uniquePaymentRows: uniquePayments.length,
          },
          recommendedAction:
            "Review invoice_payments before relying on collected or balance totals.",
        })
      );
    }

    if (
      !excludedFromAr &&
      paymentsReceivedByInvoice.has(invoiceId) &&
      !nearlyEqual(paymentsReceivedPaid, invoicePaymentPaid)
    ) {
      issues.push(
        makeIssue({
          severity: "medium",
          category: "invoice_reconciliation",
          table: "invoices",
          id: invoiceId,
          message: "Payments received and invoice payment ledger do not reconcile.",
          evidence: {
            paymentsReceivedPaid,
            invoicePaymentPaid,
            delta: moneyDelta(paymentsReceivedPaid, invoicePaymentPaid),
          },
          recommendedAction: "Review payment_received_id linkage before counting cash collected.",
        })
      );
    }

    if (!nearlyEqual(storedBalance, expectedBalance)) {
      issues.push(
        makeIssue({
          severity: excludedFromAr ? "medium" : "high",
          category: "invoice_reconciliation",
          table: "invoices",
          id: invoiceId,
          message: excludedFromAr
            ? "Draft or void invoice carries outstanding balance data."
            : "Invoice balance due does not match total minus paid.",
          evidence: {
            status,
            storedBalance,
            expectedBalance,
            storedTotal,
            paidUsed: invoicePaymentPaid,
            delta: moneyDelta(storedBalance, expectedBalance),
          },
          recommendedAction:
            "Review invoice status, payment rows, and balance fields before reporting AR.",
        })
      );
    }
  }

  return { issues };
}

function estimateItem(row: UnknownRow): EstimateItemRow {
  return {
    id: rowId(row),
    estimateId: relationId(row, "estimate_id"),
    costCode: String(row.cost_code ?? ""),
    desc: String(row.desc ?? ""),
    qty: toMoney(row.qty),
    unit: String(row.unit ?? ""),
    unitCost: toMoney(row.unit_cost),
    markupPct: toMoney(row.markup_pct),
    hideAmountOnPdf: Boolean(row.hide_amount_on_pdf),
    status:
      row.status === "optional" ||
      row.status === "allowance" ||
      row.status === "excluded" ||
      row.status === "owner_supplied"
        ? row.status
        : "included",
    sortOrder: Number(row.sort_order ?? 0) || 0,
  };
}

function buildEstimateIssues(tables: Map<string, TableRead>): {
  statusOverride?: "error";
  issues: SystemFinancialReconciliationIssue[];
} {
  const errorIssues = tableErrors(
    tables,
    ["estimates", "estimate_items", "estimate_meta", "estimate_payment_schedule_items"],
    "estimate_reconciliation"
  );
  if (errorIssues.length > 0) return { statusOverride: "error", issues: errorIssues };

  const estimateRows = rowsFor(tables, "estimates");
  const itemsByEstimate = groupBy(rowsFor(tables, "estimate_items"), "estimate_id");
  const metaByEstimate = new Map(
    rowsFor(tables, "estimate_meta").map((row) => [relationId(row, "estimate_id"), row])
  );
  const scheduleByEstimate = groupBy(
    rowsFor(tables, "estimate_payment_schedule_items"),
    "estimate_id"
  );
  const invoiceRead = tables.get("invoices");
  const scheduleReferencesInvoice = rowsFor(tables, "estimate_payment_schedule_items").some((row) =>
    relationId(row, "invoice_id")
  );
  if (scheduleReferencesInvoice && invoiceRead?.error) {
    return {
      statusOverride: "error",
      issues: [
        makeIssue({
          severity: "critical",
          category: "estimate_reconciliation",
          table: "invoices",
          id: "invoices:read-error",
          message: "Linked estimate invoices could not be checked.",
          evidence: { table: "invoices", error: invoiceRead.error },
          recommendedAction:
            "Review invoice read access before trusting generated estimate invoice checks.",
        }),
      ],
    };
  }
  const invoiceById = new Map(rowsFor(tables, "invoices").map((row) => [rowId(row), row]));
  const issues: SystemFinancialReconciliationIssue[] = [];

  for (const estimate of estimateRows) {
    const estimateId = rowId(estimate);
    const meta = metaByEstimate.get(estimateId);
    const items = (itemsByEstimate.get(estimateId) ?? []).map(estimateItem);
    const summary = computeSummary(
      items,
      {
        tax: toMoney(meta?.tax),
        discount: toMoney(meta?.discount),
        overheadPct: toMoney(meta?.overhead_pct),
        profitPct: toMoney(meta?.profit_pct),
      },
      () => undefined
    );

    const schedule = scheduleByEstimate.get(estimateId) ?? [];
    const scheduleTotal = toMoney(schedule.reduce((sum, row) => sum + toMoney(row.amount), 0));
    if (schedule.length > 0 && !nearlyEqual(scheduleTotal, summary.total)) {
      issues.push(
        makeIssue({
          severity: "medium",
          category: "estimate_reconciliation",
          table: "estimates",
          id: estimateId,
          message: "Estimate payment schedule total does not match estimate total.",
          evidence: {
            estimateTotal: summary.total,
            scheduleTotal,
            delta: moneyDelta(scheduleTotal, summary.total),
            scheduleItems: schedule.length,
          },
          recommendedAction:
            "Review payment schedule milestones before generating invoices from this estimate.",
        })
      );
    }

    for (const scheduleItem of schedule) {
      const invoiceId = relationId(scheduleItem, "invoice_id");
      if (!invoiceId) continue;
      const invoice = invoiceById.get(invoiceId);
      if (!invoice) {
        issues.push(
          makeIssue({
            severity: "high",
            category: "estimate_reconciliation",
            table: "estimate_payment_schedule_items",
            id: rowId(scheduleItem),
            message: "Estimate payment schedule item links to a missing invoice.",
            evidence: { estimateId, invoiceId, scheduleAmount: toMoney(scheduleItem.amount) },
            recommendedAction:
              "Review schedule invoice linkage before trusting estimate billing progress.",
          })
        );
        continue;
      }
      const scheduleAmount = toMoney(scheduleItem.amount);
      const invoiceTotal = toMoney(invoice.total);
      if (!nearlyEqual(scheduleAmount, invoiceTotal)) {
        issues.push(
          makeIssue({
            severity: "high",
            category: "estimate_reconciliation",
            table: "estimate_payment_schedule_items",
            id: rowId(scheduleItem),
            message: "Generated invoice total does not match payment schedule amount.",
            evidence: {
              estimateId,
              invoiceId,
              scheduleAmount,
              invoiceTotal,
              delta: moneyDelta(invoiceTotal, scheduleAmount),
            },
            recommendedAction: "Review the generated invoice before sending or collecting payment.",
          })
        );
      }
    }
  }

  return { issues };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function buildProjectIssues(
  tables: Map<string, TableRead>,
  options: Required<Pick<SystemFinancialReconciliationOptions, "projectLimit">> &
    Pick<SystemFinancialReconciliationOptions, "projectSnapshotLoader" | "ownerDashboardLoader">
): Promise<{ statusOverride?: "error"; issues: SystemFinancialReconciliationIssue[] }> {
  const errorIssues = tableErrors(tables, ["projects"], "project_snapshot");
  if (errorIssues.length > 0) return { statusOverride: "error", issues: errorIssues };

  const projects = rowsFor(tables, "projects").slice(0, options.projectLimit);
  const issues: SystemFinancialReconciliationIssue[] = [];
  const snapshotByProject = new Map<string, ProjectFinancialSnapshot>();

  for (const project of projects) {
    const projectId = rowId(project);
    const contractIssues = getProjectContractReviewIssues({
      budget: toNullableMoney(project.budget),
      contractAmount: toNullableMoney(project.contract_amount),
    });
    for (const issue of contractIssues) {
      issues.push(
        makeIssue({
          severity: "medium",
          category: "project_snapshot",
          table: "projects",
          id: projectId,
          message: `Project contract value needs review: ${issue.description}`,
          evidence: {
            issueCode: issue.code,
            budget: toNullableMoney(project.budget),
            contractAmount: toNullableMoney(project.contract_amount),
          },
          recommendedAction: "Open Project Financial Review and confirm the base contract value.",
        })
      );
    }
  }

  if (options.projectSnapshotLoader) {
    const snapshotChecks = await mapWithConcurrency(projects, 4, async (project) => {
      const projectId = rowId(project);
      try {
        const snapshot = await options.projectSnapshotLoader!(projectId);
        return { ok: true as const, projectId, snapshot };
      } catch (error) {
        return {
          ok: false as const,
          projectId,
          error: safeErrorMessage(error, "Project snapshot failed."),
        };
      }
    });
    for (const check of snapshotChecks) {
      if (check.ok) {
        snapshotByProject.set(check.projectId, check.snapshot);
        for (const warning of check.snapshot.warnings ?? []) {
          issues.push(
            makeIssue({
              severity: warning.severity === "warning" ? "medium" : "info",
              category: "project_snapshot",
              table: "projects",
              id: check.projectId,
              message: warning.message,
              evidence: { warningCode: warning.code, sourceId: warning.sourceId ?? null },
              recommendedAction: "Review project financial snapshot warnings before closeout.",
            })
          );
        }
      } else {
        issues.push(
          makeIssue({
            severity: "high",
            category: "project_snapshot",
            table: "projects",
            id: check.projectId,
            message: "ProjectFinancialSnapshot could not generate for this project.",
            evidence: { error: check.error },
            recommendedAction:
              "Review project financial source tables before relying on project profit.",
          })
        );
      }
    }
  }

  if (options.ownerDashboardLoader && options.projectSnapshotLoader) {
    try {
      const dashboard = await options.ownerDashboardLoader();
      const rankedRows = [...dashboard.topProjects, ...dashboard.underwaterProjects];
      for (const row of rankedRows) {
        let snapshot = snapshotByProject.get(row.projectId);
        if (!snapshot) {
          try {
            snapshot = await options.projectSnapshotLoader(row.projectId);
            snapshotByProject.set(row.projectId, snapshot);
          } catch {
            continue;
          }
        }
        const comparisons = [
          ["revenue", row.revenue, snapshot.revisedContractValue],
          ["expense", row.expense, snapshot.actualCost],
          ["profit", row.profit, snapshot.grossProfit],
        ] as const;
        for (const [field, dashboardValue, snapshotValue] of comparisons) {
          if (nearlyEqual(dashboardValue, snapshotValue)) continue;
          issues.push(
            makeIssue({
              severity: "medium",
              category: "project_snapshot",
              table: "projects",
              id: row.projectId,
              message: `Owner dashboard project ${field} does not match snapshot value.`,
              evidence: {
                field,
                dashboardValue: toMoney(dashboardValue),
                snapshotValue: toMoney(snapshotValue),
                delta: moneyDelta(dashboardValue, snapshotValue),
              },
              recommendedAction:
                "Compare owner dashboard values with ProjectFinancialSnapshot before relying on rankings.",
            })
          );
        }
      }
    } catch (error) {
      issues.push(
        makeIssue({
          severity: "critical",
          category: "project_snapshot",
          table: "finance_owner_dashboard",
          id: "owner-dashboard:read-error",
          message: "Owner dashboard data could not be loaded for reconciliation.",
          evidence: { error: safeErrorMessage(error, "Owner dashboard failed.") },
          recommendedAction: "Review owner dashboard server read path before trusting rankings.",
        })
      );
      return { statusOverride: "error", issues };
    }
  }

  return { issues };
}

async function buildWorkerIssues(
  options: Pick<SystemFinancialReconciliationOptions, "workerBalanceLoader">
): Promise<{ statusOverride?: "error"; issues: SystemFinancialReconciliationIssue[] }> {
  const issues: SystemFinancialReconciliationIssue[] = [];
  if (!options.workerBalanceLoader) return { issues };

  try {
    const balances = await options.workerBalanceLoader();
    for (const row of balances) {
      for (const field of [
        "laborOwed",
        "reimbursements",
        "payments",
        "advances",
        "balance",
      ] as const) {
        const value = row[field];
        if (Number.isFinite(value)) continue;
        issues.push(
          makeIssue({
            severity: "high",
            category: "worker_balance",
            table: "worker_balances",
            id: row.workerId,
            message: "Worker balance helper returned a non-finite amount.",
            evidence: { field, value: String(value) },
            recommendedAction:
              "Review worker balance source rows before relying on payroll or reimbursement totals.",
          })
        );
      }
    }
  } catch (error) {
    issues.push(
      makeIssue({
        severity: "critical",
        category: "worker_balance",
        table: "worker_balances",
        id: "worker-balances:read-error",
        message: "Worker balance helper could not generate balances.",
        evidence: { error: safeErrorMessage(error, "Worker balance check failed.") },
        recommendedAction:
          "Review worker balance read path before relying on worker payable totals.",
      })
    );
    return { statusOverride: "error", issues };
  }

  return { issues };
}

async function buildMarkerImpactIssues(
  options: Pick<SystemFinancialReconciliationOptions, "integrityScanLoader">
): Promise<{ statusOverride?: "error"; issues: SystemFinancialReconciliationIssue[] }> {
  const issues: SystemFinancialReconciliationIssue[] = [];
  if (!options.integrityScanLoader) return { issues };

  try {
    const scan = await options.integrityScanLoader();
    for (const section of scan.sections) {
      for (const issue of section.issues) {
        const labels = Array.isArray(issue.evidence.labels)
          ? issue.evidence.labels.filter((label): label is string => typeof label === "string")
          : [];
        const hasFinancialImpact =
          issue.classification === "requires_reversal_policy" ||
          labels.includes("affects_worker_balance") ||
          labels.includes("affects_project_actual_cost") ||
          labels.includes("paid_reimbursement") ||
          labels.includes("generated_expense");
        if (!hasFinancialImpact) continue;
        issues.push(
          makeIssue({
            severity:
              issue.severity === "critical" || issue.severity === "high" ? "high" : "medium",
            category: "financial_marker_impact",
            table: issue.table,
            id: issue.id,
            message: "System Integrity Scanner found marker data with possible financial impact.",
            evidence: {
              sourceSection: section.title,
              scannerCategory: issue.category,
              classification: issue.classification ?? null,
              labels,
            },
            recommendedAction:
              "Review the System Integrity Scanner finding and define a reversal policy before cleanup.",
          })
        );
      }
    }
  } catch (error) {
    issues.push(
      makeIssue({
        severity: "critical",
        category: "financial_marker_impact",
        table: "system_integrity_scan",
        id: "integrity-scan:read-error",
        message: "System Integrity Scanner could not be loaded for marker impact review.",
        evidence: { error: safeErrorMessage(error, "Integrity scan failed.") },
        recommendedAction:
          "Run the read-only System Integrity Scanner before marker financial impact review.",
      })
    );
    return { statusOverride: "error", issues };
  }

  return { issues };
}

export async function buildSystemFinancialReconciliationReport(
  client: SystemFinancialReconciliationReadClient,
  options: SystemFinancialReconciliationOptions = {}
): Promise<SystemFinancialReconciliationReport> {
  const rowLimit = options.rowLimit ?? DEFAULT_ROW_LIMIT;
  const projectLimit = options.projectLimit ?? DEFAULT_PROJECT_LIMIT;
  const maxIssues = options.maxIssuesPerSection ?? DEFAULT_MAX_ISSUES_PER_SECTION;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const tableEntries = await Promise.all(
    FINANCIAL_TABLES.map(
      async (table) => [table, await loadTable(client, table, rowLimit)] as const
    )
  );
  const tables = new Map<string, TableRead>(tableEntries);

  const invoice = buildInvoiceIssues(tables);
  const estimate = buildEstimateIssues(tables);
  const [project, worker, marker] = await Promise.all([
    buildProjectIssues(tables, {
      projectLimit,
      projectSnapshotLoader: options.projectSnapshotLoader,
      ownerDashboardLoader: options.ownerDashboardLoader,
    }),
    buildWorkerIssues({ workerBalanceLoader: options.workerBalanceLoader }),
    buildMarkerImpactIssues({ integrityScanLoader: options.integrityScanLoader }),
  ]);

  const sections = [
    makeSection(
      "invoice-reconciliation",
      "Invoice Reconciliation",
      invoice.issues,
      maxIssues,
      invoice.statusOverride
    ),
    makeSection(
      "estimate-reconciliation",
      "Estimate Reconciliation",
      estimate.issues,
      maxIssues,
      estimate.statusOverride
    ),
    makeSection(
      "project-snapshot",
      "Project Snapshot",
      project.issues,
      maxIssues,
      project.statusOverride
    ),
    makeSection(
      "worker-balance",
      "Worker Balance",
      worker.issues,
      maxIssues,
      worker.statusOverride
    ),
    makeSection(
      "financial-marker-impact",
      "Marker Financial Impact",
      marker.issues,
      maxIssues,
      marker.statusOverride
    ),
  ];
  const allIssues = sections.flatMap((section) => section.allIssues);
  const returnedSections = sections.map((section) => section.section);
  const status = returnedSections.some((section) => section.status === "error")
    ? "error"
    : statusFromIssues(allIssues);

  return {
    status,
    generatedAt,
    summary: summarize(allIssues),
    sections: returnedSections,
  };
}
