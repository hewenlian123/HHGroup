import { safeErrorMessage, redactSensitiveText } from "@/lib/system-response-safety";

export type SystemIntegrityStatus = "pass" | "warning" | "fail";
export type SystemIntegritySeverity = "info" | "low" | "medium" | "high" | "critical";
export type SystemIntegrityCategory =
  | "test_marker"
  | "orphan_relation"
  | "dependency_risk"
  | "financial_mismatch"
  | "production_safety";
export type SystemIntegrityClassification =
  | "intentionally_retained"
  | "requires_reversal_policy"
  | "dependency_review_needed";

export type SystemIntegrityIssue = {
  severity: SystemIntegritySeverity;
  category: SystemIntegrityCategory;
  table: string;
  id: string;
  message: string;
  classification?: SystemIntegrityClassification;
  evidence: Record<string, unknown>;
  recommendedAction: string;
  autoFixAvailable: false;
};

export type SystemIntegritySection = {
  id: string;
  title: string;
  status: SystemIntegrityStatus;
  issues: SystemIntegrityIssue[];
};

export type SystemIntegrityScanReport = {
  status: SystemIntegrityStatus;
  generatedAt: string;
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  sections: SystemIntegritySection[];
};

export type UnknownRow = Record<string, unknown>;

type SupabaseErrorLike = { message?: string; code?: string } | null;
type SupabaseReadResult = {
  data: unknown[] | null;
  error: SupabaseErrorLike;
  count?: number | null;
};
type SupabaseSelectBuilder = PromiseLike<SupabaseReadResult> & {
  limit: (count: number) => PromiseLike<SupabaseReadResult>;
  in: (column: string, values: string[]) => PromiseLike<SupabaseReadResult>;
};

export type SystemIntegrityReadClient = {
  from: (table: string) => {
    select: (
      columns?: string,
      options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }
    ) => SupabaseSelectBuilder;
  };
};

type TableScan = {
  table: string;
  rows: UnknownRow[];
  count: number;
  available: boolean;
  missing: boolean;
  truncated: boolean;
  error?: string;
};

type MarkerHit = {
  table: string;
  row: UnknownRow;
  fields: Array<{ field: string; value: string }>;
};

const SCAN_LIMIT = 1_000;
const MAX_SECTION_ISSUES = 50;
const MARKER_RE = /TEST|safe to delete|PROD-SMOKE|E2E|Playwright|Smoke Test/i;
const EXACT_ALLOWLIST = [
  {
    table: "customers",
    id: "e7b425ed-7ea0-4597-8eff-b006c33229b1",
    reason:
      "Intentionally retained Test Customer reference row; no linked work found during production triage.",
    classification: "intentionally_retained" as const,
  },
] as const;

const MARKER_TABLES = [
  "customers",
  "projects",
  "estimates",
  "estimate_items",
  "estimate_payment_schedule_items",
  "invoices",
  "invoice_items",
  "invoice_payments",
  "payments_received",
  "deposits",
  "expenses",
  "expense_lines",
  "expense_attachments",
  "worker_receipts",
  "worker_reimbursements",
  "worker_payments",
  "worker_advances",
  "labor_entries",
  "project_change_orders",
  "change_orders",
  "activity_logs",
] as const;

const RELATION_TABLES = ["payment_received_attachments", ...MARKER_TABLES] as const;

const MARKER_FIELDS = [
  "name",
  "title",
  "display_name",
  "customer_name",
  "project_name",
  "reference_no",
  "invoice_no",
  "invoice_number",
  "estimate_no",
  "estimate_number",
  "description",
  "notes",
  "vendor",
  "vendor_name",
  "file_name",
  "path",
  "public_url",
  "storage_path",
] as const;

function isMissingTableError(error: { message?: string; code?: string } | null): boolean {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation.*does not exist|does not exist|not found|not exist|schema cache/i.test(message)
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowId(row: UnknownRow): string {
  const id = row.id;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : "unknown";
}

function allowlistEntry(table: string, id: string) {
  return EXACT_ALLOWLIST.find((entry) => entry.table === table && entry.id === id);
}

function relationId(row: UnknownRow, field: string): string {
  const value = row[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function hasField(row: UnknownRow, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function truncate(value: string, max = 140): string {
  const clean = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function severityRank(severity: SystemIntegritySeverity): number {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "medium") return 2;
  if (severity === "low") return 3;
  return 4;
}

function reportStatus(issues: SystemIntegrityIssue[]): SystemIntegrityStatus {
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
      if (typeof value === "string") return [key, truncate(value, 240)];
      if (Array.isArray(value)) {
        return [
          key,
          value.map((item) => {
            if (typeof item === "string") return truncate(item, 160);
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
  input: Omit<SystemIntegrityIssue, "evidence" | "autoFixAvailable"> & {
    evidence?: Record<string, unknown>;
  }
): SystemIntegrityIssue {
  return {
    ...input,
    message: redactSensitiveText(input.message),
    evidence: sanitizeEvidence(input.evidence ?? {}),
    recommendedAction: redactSensitiveText(input.recommendedAction),
    autoFixAvailable: false,
  };
}

function limitedIssues(issues: SystemIntegrityIssue[]): SystemIntegrityIssue[] {
  return [...issues]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_SECTION_ISSUES);
}

function section(
  id: string,
  title: string,
  issues: SystemIntegrityIssue[]
): SystemIntegritySection {
  return {
    id,
    title,
    status: reportStatus(issues),
    issues: limitedIssues(issues),
  };
}

async function loadTable(client: SystemIntegrityReadClient, table: string): Promise<TableScan> {
  try {
    const { data, error, count } = await client
      .from(table)
      .select("*", { count: "exact" })
      .limit(SCAN_LIMIT);
    if (error) {
      const missing = isMissingTableError(error);
      return {
        table,
        rows: [],
        count: 0,
        available: false,
        missing,
        truncated: false,
        error: missing ? undefined : safeErrorMessage(error.message, `${table} could not be read.`),
      };
    }
    const rows = Array.isArray(data) ? (data as UnknownRow[]) : [];
    const rowCount = typeof count === "number" ? count : rows.length;
    return {
      table,
      rows,
      count: rowCount,
      available: true,
      missing: false,
      truncated: rowCount > rows.length,
    };
  } catch (error) {
    return {
      table,
      rows: [],
      count: 0,
      available: false,
      missing: false,
      truncated: false,
      error: safeErrorMessage(error, `${table} could not be read.`),
    };
  }
}

async function fetchExistingIds(
  client: SystemIntegrityReadClient,
  table: string,
  ids: string[]
): Promise<Set<string> | null> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Set();
  const existing = new Set<string>();
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const chunk = uniqueIds.slice(index, index + 100);
    const { data, error } = await client.from(table).select("id").in("id", chunk);
    if (error) return null;
    for (const row of (data ?? []) as UnknownRow[]) {
      const id = rowId(row);
      if (id !== "unknown") existing.add(id);
    }
  }
  return existing;
}

function scanMarkers(scans: Map<string, TableScan>): {
  issues: SystemIntegrityIssue[];
  hits: MarkerHit[];
} {
  const issues: SystemIntegrityIssue[] = [];
  const hits: MarkerHit[] = [];

  for (const table of MARKER_TABLES) {
    const scan = scans.get(table);
    if (!scan?.available) continue;
    for (const row of scan.rows) {
      const fields = MARKER_FIELDS.flatMap((field) => {
        const value = stringValue(row[field]);
        return value && MARKER_RE.test(value) ? [{ field, value: truncate(value) }] : [];
      });
      if (fields.length === 0) continue;
      const id = rowId(row);
      const allowlist = allowlistEntry(table, id);
      const markerContext = markerIssueContext(table, row, scans);
      hits.push({ table, row, fields });

      if (allowlist) {
        issues.push(
          makeIssue({
            severity: "info",
            category: "test_marker",
            table,
            id,
            classification: allowlist.classification,
            message: `Exact allowlisted test marker retained in ${table}.`,
            evidence: {
              fields,
              linkedIds: linkedIds(row),
              classification: allowlist.classification,
              labels: ["allowlisted_retained_row"],
              allowlistReason: allowlist.reason,
            },
            recommendedAction: "Retained by exact-ID allowlist; review periodically.",
          })
        );
        continue;
      }

      issues.push(
        makeIssue({
          severity: "medium",
          category: "test_marker",
          table,
          id,
          classification: markerContext.classification,
          message: markerContext.message ?? `Strong test marker text found in ${table}.`,
          evidence: {
            fields,
            linkedIds: linkedIds(row),
            labels: markerContext.labels,
          },
          recommendedAction:
            markerContext.recommendedAction ??
            "Review this marker row and clean it only through an approved exact-ID cleanup path.",
        })
      );
    }
    if (scan.truncated) {
      issues.push(
        makeIssue({
          severity: "info",
          category: "production_safety",
          table,
          id: `${table}:scan-limit`,
          message: `${table} marker scan reached the row limit.`,
          evidence: { scanLimit: SCAN_LIMIT, tableCount: scan.count },
          recommendedAction:
            "Use a focused exact-ID audit for rows beyond the scanner limit if marker pollution is suspected.",
        })
      );
    }
  }

  return { issues, hits };
}

function linkedIds(row: UnknownRow): Record<string, string> {
  const fields = [
    "project_id",
    "customer_id",
    "invoice_id",
    "payment_id",
    "payment_received_id",
    "expense_id",
    "estimate_id",
    "worker_id",
    "reimbursement_id",
  ];
  return Object.fromEntries(
    fields
      .map((field) => [field, relationId(row, field)] as const)
      .filter(([, value]) => value.length > 0)
  );
}

async function orphanIssuesFor(
  client: SystemIntegrityReadClient,
  scans: Map<string, TableScan>,
  params: {
    childTable: string;
    childField: string;
    parentTable: string;
    severity?: SystemIntegritySeverity;
    message: string;
    recommendedAction: string;
  }
): Promise<SystemIntegrityIssue[]> {
  const child = scans.get(params.childTable);
  const parent = scans.get(params.parentTable);
  if (!child?.available || !parent?.available) return [];

  const childRows = child.rows.filter((row) => hasField(row, params.childField));
  const parentIds = childRows.map((row) => relationId(row, params.childField)).filter(Boolean);
  const existingParentIds = await fetchExistingIds(client, params.parentTable, parentIds);
  if (!existingParentIds) {
    return [
      makeIssue({
        severity: "medium",
        category: "production_safety",
        table: params.childTable,
        id: `${params.childTable}:${params.childField}:verify-failed`,
        message: `Could not verify ${params.childTable}.${params.childField} references.`,
        evidence: { childTable: params.childTable, parentTable: params.parentTable },
        recommendedAction: "Review server logs and schema availability before trusting this scan.",
      }),
    ];
  }

  return childRows.flatMap((row) => {
    const parentId = relationId(row, params.childField);
    if (!parentId || existingParentIds.has(parentId)) return [];
    return [
      makeIssue({
        severity: params.severity ?? "high",
        category: "orphan_relation",
        table: params.childTable,
        id: rowId(row),
        message: params.message,
        evidence: {
          field: params.childField,
          missingParentTable: params.parentTable,
          missingParentId: parentId,
          linkedIds: linkedIds(row),
        },
        recommendedAction: params.recommendedAction,
      }),
    ];
  });
}

async function buildInvoicePaymentIssues(
  client: SystemIntegrityReadClient,
  scans: Map<string, TableScan>
): Promise<SystemIntegrityIssue[]> {
  return (
    await Promise.all([
      orphanIssuesFor(client, scans, {
        childTable: "invoice_items",
        childField: "invoice_id",
        parentTable: "invoices",
        message: "Invoice item points to a missing invoice.",
        recommendedAction:
          "Inspect the invoice item and remove or relink it through an approved admin path.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "invoice_payments",
        childField: "invoice_id",
        parentTable: "invoices",
        message: "Invoice payment points to a missing invoice.",
        recommendedAction:
          "Inspect invoice payment dependencies before recalculating paid totals or AR.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "invoice_payments",
        childField: "payment_received_id",
        parentTable: "payments_received",
        message: "Invoice payment points to a missing payment received row.",
        recommendedAction:
          "Inspect payment_received linkage before relying on paid total or deposit matching.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "payments_received",
        childField: "invoice_id",
        parentTable: "invoices",
        message: "Payment received points to a missing invoice.",
        recommendedAction: "Inspect payment and invoice linkage before reporting AR.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "deposits",
        childField: "invoice_id",
        parentTable: "invoices",
        message: "Deposit points to a missing invoice.",
        recommendedAction: "Inspect deposit linkage before reporting cash/deposit totals.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "deposits",
        childField: "payment_id",
        parentTable: "payments_received",
        message: "Deposit points to a missing payment received row.",
        recommendedAction: "Inspect deposit/payment linkage before reporting cash totals.",
      }),
    ])
  ).flat();
}

async function buildExpenseIssues(
  client: SystemIntegrityReadClient,
  scans: Map<string, TableScan>
): Promise<SystemIntegrityIssue[]> {
  return (
    await Promise.all([
      orphanIssuesFor(client, scans, {
        childTable: "expense_lines",
        childField: "expense_id",
        parentTable: "expenses",
        message: "Expense line points to a missing expense.",
        recommendedAction: "Inspect the expense line before relying on project actual cost.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "expense_attachments",
        childField: "expense_id",
        parentTable: "expenses",
        severity: "medium",
        message: "Expense attachment points to a missing expense.",
        recommendedAction: "Inspect attachment linkage before removing any storage object.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "expense_lines",
        childField: "project_id",
        parentTable: "projects",
        severity: "medium",
        message: "Expense line points to a missing project.",
        recommendedAction: "Inspect the expense line project assignment.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "expenses",
        childField: "project_id",
        parentTable: "projects",
        severity: "medium",
        message: "Expense points to a missing project.",
        recommendedAction: "Inspect the expense project assignment.",
      }),
    ])
  ).flat();
}

async function buildEstimateScheduleIssues(
  client: SystemIntegrityReadClient,
  scans: Map<string, TableScan>
): Promise<SystemIntegrityIssue[]> {
  return (
    await Promise.all([
      orphanIssuesFor(client, scans, {
        childTable: "estimate_payment_schedule_items",
        childField: "estimate_id",
        parentTable: "estimates",
        message: "Estimate payment schedule item points to a missing estimate.",
        recommendedAction: "Inspect the estimate payment schedule linkage.",
      }),
      orphanIssuesFor(client, scans, {
        childTable: "estimate_payment_schedule_items",
        childField: "invoice_id",
        parentTable: "invoices",
        message: "Estimate payment schedule item points to a missing invoice.",
        recommendedAction: "Inspect schedule invoice linkage before billing from this schedule.",
      }),
    ])
  ).flat();
}

function countBy(rows: UnknownRow[], field: string, id: string): number {
  return rows.filter((row) => relationId(row, field) === id).length;
}

function findRowById(scans: Map<string, TableScan>, table: string, id: string): UnknownRow | null {
  if (!id) return null;
  return scans.get(table)?.rows.find((row) => rowId(row) === id) ?? null;
}

function rowHasMarker(row: UnknownRow | null): boolean {
  if (!row) return false;
  return MARKER_FIELDS.some((field) => MARKER_RE.test(stringValue(row[field])));
}

function isLinkedToRealProject(scans: Map<string, TableScan>, row: UnknownRow): boolean {
  const projectId = relationId(row, "project_id");
  if (!projectId) return false;
  const project = findRowById(scans, "projects", projectId);
  return Boolean(project && !rowHasMarker(project));
}

function isPaidReimbursement(row: UnknownRow): boolean {
  return (
    stringValue(row.status).toLowerCase() === "paid" ||
    stringValue(row.paid_at).length > 0 ||
    stringValue(row.payment_id).length > 0
  );
}

function isGeneratedExpense(row: UnknownRow): boolean {
  const source = stringValue(row.source).toLowerCase();
  const referenceNo = stringValue(row.reference_no);
  return (
    source === "worker_reimbursement" ||
    relationId(row, "source_id").length > 0 ||
    /^REIM-/i.test(referenceNo)
  );
}

function uniqueLabels(labels: Array<string | false | null | undefined>): string[] {
  return Array.from(new Set(labels.filter((label): label is string => Boolean(label))));
}

function markerIssueContext(
  table: string,
  row: UnknownRow,
  scans: Map<string, TableScan>
): {
  classification?: SystemIntegrityClassification;
  labels: string[];
  recommendedAction?: string;
  message?: string;
} {
  if (table === "worker_reimbursements") {
    const id = rowId(row);
    const linkedReceiptCount = countBy(
      scans.get("worker_receipts")?.rows ?? [],
      "reimbursement_id",
      id
    );
    const labels = uniqueLabels([
      "requires_reversal_policy",
      "affects_worker_balance",
      relationId(row, "project_id") && "affects_project_actual_cost",
      isLinkedToRealProject(scans, row) && "linked_real_project",
      isPaidReimbursement(row) && "paid_reimbursement",
      linkedReceiptCount > 0 && "linked_worker_receipt",
    ]);
    return {
      classification: "requires_reversal_policy",
      labels,
      message:
        "Strong test marker text found in worker reimbursement; financial reversal policy required.",
      recommendedAction:
        "Do not hard-delete paid worker reimbursement data. Review a financial reversal policy before cleanup.",
    };
  }

  if (table === "worker_receipts") {
    const labels = uniqueLabels([
      "requires_reversal_policy",
      relationId(row, "reimbursement_id") && "linked_worker_reimbursement",
      relationId(row, "reimbursement_id") && "affects_worker_balance",
      relationId(row, "project_id") && "affects_project_actual_cost",
      isLinkedToRealProject(scans, row) && "linked_real_project",
    ]);
    return {
      classification: "requires_reversal_policy",
      labels,
      message:
        "Strong test marker text found in worker receipt; reimbursement workflow review required.",
      recommendedAction:
        "Do not delete this receipt or storage object without a reimbursement reversal policy.",
    };
  }

  if (table === "expenses") {
    const labels = uniqueLabels([
      "requires_reversal_policy",
      isGeneratedExpense(row) && "generated_expense",
      relationId(row, "source_id") && "linked_worker_reimbursement",
      relationId(row, "project_id") && "affects_project_actual_cost",
      isLinkedToRealProject(scans, row) && "linked_real_project",
    ]);
    if (labels.length === 0) return { labels };
    return {
      classification: "requires_reversal_policy",
      labels,
      message:
        "Strong test marker text found in generated expense; financial reversal policy required.",
      recommendedAction:
        "Do not hard-delete this generated expense without reversing the linked reimbursement workflow.",
    };
  }

  return { labels: [] };
}

function buildMarkerDependencyIssues(
  scans: Map<string, TableScan>,
  markerHits: MarkerHit[]
): SystemIntegrityIssue[] {
  const issues: SystemIntegrityIssue[] = [];
  const byTable = new Map<string, MarkerHit[]>();
  for (const hit of markerHits) {
    const current = byTable.get(hit.table) ?? [];
    current.push(hit);
    byTable.set(hit.table, current);
  }

  for (const hit of byTable.get("projects") ?? []) {
    const id = rowId(hit.row);
    const dependencyCounts = {
      invoices: countBy(scans.get("invoices")?.rows ?? [], "project_id", id),
      expenses: countBy(scans.get("expenses")?.rows ?? [], "project_id", id),
      expenseLines: countBy(scans.get("expense_lines")?.rows ?? [], "project_id", id),
      laborEntries: countBy(scans.get("labor_entries")?.rows ?? [], "project_id", id),
      projectChangeOrders: countBy(
        scans.get("project_change_orders")?.rows ?? [],
        "project_id",
        id
      ),
      changeOrders: countBy(scans.get("change_orders")?.rows ?? [], "project_id", id),
    };
    const total = Object.values(dependencyCounts).reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;
    issues.push(
      makeIssue({
        severity: "medium",
        category: "dependency_risk",
        table: "projects",
        id,
        message: "Marker project has linked financial or operational dependencies.",
        evidence: { dependencyCounts, markerFields: hit.fields },
        recommendedAction:
          "Do not delete this marker project without an exact dependency graph and owner approval.",
      })
    );
  }

  for (const hit of byTable.get("invoices") ?? []) {
    const id = rowId(hit.row);
    const dependencyCounts = {
      invoicePayments: countBy(scans.get("invoice_payments")?.rows ?? [], "invoice_id", id),
      paymentsReceived: countBy(scans.get("payments_received")?.rows ?? [], "invoice_id", id),
      deposits: countBy(scans.get("deposits")?.rows ?? [], "invoice_id", id),
    };
    const total = Object.values(dependencyCounts).reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;
    issues.push(
      makeIssue({
        severity: "medium",
        category: "dependency_risk",
        table: "invoices",
        id,
        message: "Marker invoice has linked payment/deposit dependencies.",
        evidence: { dependencyCounts, markerFields: hit.fields },
        recommendedAction:
          "Clean payment/deposit children first through an exact-ID reviewed cleanup plan.",
      })
    );
  }

  for (const hit of byTable.get("expenses") ?? []) {
    const id = rowId(hit.row);
    const dependencyCounts = {
      expenseLines: countBy(scans.get("expense_lines")?.rows ?? [], "expense_id", id),
      expenseAttachments: countBy(scans.get("expense_attachments")?.rows ?? [], "expense_id", id),
    };
    const total = Object.values(dependencyCounts).reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;
    const markerContext = markerIssueContext("expenses", hit.row, scans);
    issues.push(
      makeIssue({
        severity: "low",
        category: "dependency_risk",
        table: "expenses",
        id,
        message: "Marker expense has linked lines or attachments.",
        classification: markerContext.classification,
        evidence: { dependencyCounts, markerFields: hit.fields, labels: markerContext.labels },
        recommendedAction:
          markerContext.recommendedAction ??
          "Review child rows before cleaning this marker expense.",
      })
    );
  }

  for (const hit of byTable.get("payments_received") ?? []) {
    const id = rowId(hit.row);
    const dependencyCounts = {
      deposits: countBy(scans.get("deposits")?.rows ?? [], "payment_id", id),
      paymentReceivedAttachments: countBy(
        scans.get("payment_received_attachments")?.rows ?? [],
        "payment_id",
        id
      ),
    };
    const total = Object.values(dependencyCounts).reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;
    issues.push(
      makeIssue({
        severity: "medium",
        category: "dependency_risk",
        table: "payments_received",
        id,
        message: "Marker payment has linked deposit or attachment dependencies.",
        evidence: { dependencyCounts, markerFields: hit.fields },
        recommendedAction: "Review deposit and attachment dependencies before cleanup.",
      })
    );
  }

  for (const hit of byTable.get("worker_receipts") ?? []) {
    const id = rowId(hit.row);
    const reimbursementId = relationId(hit.row, "reimbursement_id");
    const linkedReimbursements = reimbursementId
      ? countBy(scans.get("worker_reimbursements")?.rows ?? [], "id", reimbursementId)
      : 0;
    if (!reimbursementId && linkedReimbursements === 0) continue;
    const markerContext = markerIssueContext("worker_receipts", hit.row, scans);
    issues.push(
      makeIssue({
        severity: "medium",
        category: "dependency_risk",
        table: "worker_receipts",
        id,
        message: "Marker worker receipt may be linked to reimbursement workflow data.",
        classification: markerContext.classification,
        evidence: {
          reimbursementId,
          linkedReimbursements,
          markerFields: hit.fields,
          labels: markerContext.labels,
        },
        recommendedAction:
          markerContext.recommendedAction ??
          "Do not remove this receipt or storage object without checking reimbursement linkage.",
      })
    );
  }

  return issues;
}

function tableReadIssues(scans: Map<string, TableScan>): SystemIntegrityIssue[] {
  return Array.from(scans.values()).flatMap((scan) => {
    if (scan.available || scan.missing || !scan.error) return [];
    return [
      makeIssue({
        severity: "medium",
        category: "production_safety",
        table: scan.table,
        id: `${scan.table}:read-error`,
        message: `${scan.table} could not be scanned.`,
        evidence: { message: scan.error },
        recommendedAction: "Review server Supabase read access and schema availability.",
      }),
    ];
  });
}

function summarize(issues: SystemIntegrityIssue[]): SystemIntegrityScanReport["summary"] {
  const actionableIssues = issues.filter((issue) => issue.severity !== "info");
  return {
    totalIssues: actionableIssues.length,
    critical: issues.filter((issue) => issue.severity === "critical").length,
    high: issues.filter((issue) => issue.severity === "high").length,
    medium: issues.filter((issue) => issue.severity === "medium").length,
    low: issues.filter((issue) => issue.severity === "low").length,
  };
}

export async function buildSystemIntegrityScanReport(
  client: SystemIntegrityReadClient
): Promise<SystemIntegrityScanReport> {
  const tableNames = Array.from(new Set(RELATION_TABLES));
  const scanEntries = await Promise.all(
    tableNames.map(async (table) => [table, await loadTable(client, table)] as const)
  );
  const scans = new Map(scanEntries);

  const tableIssues = tableReadIssues(scans);
  const { issues: markerIssues, hits: markerHits } = scanMarkers(scans);
  const [invoicePaymentIssues, expenseIssues, estimateScheduleIssues] = await Promise.all([
    buildInvoicePaymentIssues(client, scans),
    buildExpenseIssues(client, scans),
    buildEstimateScheduleIssues(client, scans),
  ]);
  const dependencyIssues = buildMarkerDependencyIssues(scans, markerHits);
  const allIssues = [
    ...markerIssues,
    ...invoicePaymentIssues,
    ...expenseIssues,
    ...estimateScheduleIssues,
    ...dependencyIssues,
    ...tableIssues,
  ];

  const sections = [
    section("test-marker-data", "Test Marker Data", markerIssues),
    section(
      "invoice-payment-deposit",
      "Invoice / Payment / Deposit Dependencies",
      invoicePaymentIssues
    ),
    section("expense-dependencies", "Expense Dependencies", expenseIssues),
    section(
      "estimate-payment-schedule",
      "Estimate Payment Schedule Dependencies",
      estimateScheduleIssues
    ),
    section("marker-dependency-risk", "Marker Dependency Risk", dependencyIssues),
    section("scanner-read-safety", "Scanner Read Safety", tableIssues),
  ];

  return {
    status: reportStatus(allIssues),
    generatedAt: new Date().toISOString(),
    summary: summarize(allIssues),
    sections,
  };
}
