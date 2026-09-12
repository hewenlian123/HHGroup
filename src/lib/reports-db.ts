import { readCompleteRows } from "@/lib/read-complete-rows";
import "server-only";
import { expenseStatusForDatabase } from "@/lib/expenses-db";
import { expenseHasReceiptSignal } from "@/lib/expense-receipt-items";
import { expenseMatchesInboxPool } from "@/lib/expense-workflow-status";
import {
  reportingInvoiceEligible as invoiceCountsTowardRevenue,
  reportingApEligible as billCountsTowardReports,
} from "@/lib/finance-reporting-eligibility";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanonicalProjectProfitBatch, type CanonicalProjectProfit } from "@/lib/profit-engine";
import { getProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import { expenseCountsTowardCanonicalProjectCost } from "@/lib/expense-canonical-cost";

import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import {
  isLaborUnpaidForWorkerPayroll,
  laborEntryPaymentIdMapFromWorkerPayments,
} from "@/lib/labor-balance-shared";

export type ReportsTab = "monthly" | "project-profitability" | "ar-aging" | "ap-aging";

export type ReportsPeriod =
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "this-year"
  | "custom"
  | "all-time";

export type ReportDateRange = {
  period: ReportsPeriod;
  label: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
};

export type ReportsKpiKey =
  | "invoicedRevenue"
  | "cashCollected"
  | "expenses"
  | "laborCost"
  | "subcontractorCost"
  | "billsAp"
  | "outstandingAr"
  | "missingReceipts"
  | "projectBudget"
  | "projectCost"
  | "projectProfit"
  | "paidAp";

export type ReportsKpi = {
  key: ReportsKpiKey;
  label: string;
  value: number;
  previousValue: number;
  delta: number;
  deltaPct: number | null;
  kind: "currency" | "percent" | "count";
  tone: "neutral" | "positive" | "negative" | "warning";
};

export type ProjectProfitabilityRow = {
  projectId: string;
  project: string;
  customer: string;
  invoiceContractAmount: number;
  collected: number;
  expenses: number;
  labor: number;
  billsSubcontractors: number;
  totalCost: number;
  profit: number;
  marginPct: number;
  openAr: number;
  openAp: number;
  status: string;
};

export type AgingBucketName = "Current" | "1-30" | "31-60" | "61-90" | "90+";

export type AgingBucket = {
  bucket: AgingBucketName;
  amount: number;
  count: number;
};

export type AgingRow = {
  id: string;
  label: string;
  counterparty: string;
  customerId?: string | null;
  project: string;
  dueDate: string | null;
  amount: number;
  bucket: AgingBucketName;
  source: string;
};

export type ReportsData = {
  range: ReportDateRange;
  cashFlow: { label: string; start: string; end: string; income: number; expense: number }[];
  records: Record<ReportsKpiKey, ReportRecord[]>;
  definitions: Record<ReportsKpiKey, string>;
  otherPayables: { buckets: AgingBucket[]; rows: AgingRow[] };
  monthly: {
    kpis: ReportsKpi[];
    hasActivity: boolean;
  };
  projectProfitability: {
    rows: ProjectProfitabilityRow[];
  };
  arAging: {
    buckets: AgingBucket[];
    rows: AgingRow[];
  };
  apAging: {
    buckets: AgingBucket[];
    rows: AgingRow[];
  };
  projectReviewWarning?: string;
  warnings: string[];
  sources: string[];
};

export type ReportRecord = {
  id: string;
  label: string;
  amount: number;
  date: string | null;
  dueDate?: string | null;
  status: string;
  projectId: string | null;
  customerId?: string | null;
  href: string;
  source: string;
};

export const REPORT_DEFINITIONS: Record<ReportsKpiKey, string> = {
  paidAp:
    "AP Payments: recorded ap_bill_payments.amount, payment_date in period. Includes payments on void bills: bill void is not payment reversal. Reversal status is unavailable. Not total company cash out or accrued expense.",
  projectBudget:
    "Project Base Contract: sum of projects.budget, all dates and all scoped projects, including contracts requiring review. Not revised contract or invoiced revenue.",
  projectCost:
    "Reviewed Project Cost: lifetime canonical profit-engine actualCost for contract-review-ready projects; labor + eligible expense lines + Approved subcontract bills + accrued commissions. Generic AP is excluded.",
  projectProfit:
    "Reviewed Project Profit: lifetime canonical revised contract minus actualCost for contract-review-ready projects. Select a project for its financial detail. Not period accounting profit or cash flow.",
  missingReceipts:
    "Inbox Missing Receipts: count of incomplete Expense Inbox records without a receipt URL or attachment signal, expense date in period. Uses the existing Inbox pool and receipt detection; completed expense records are excluded.",
  invoicedRevenue:
    "Invoiced Revenue: invoice total, issue date in period; Sent/Partially Paid/Paid only. Draft, Void, Legacy and unknown statuses excluded. Not contract revenue or collected cash.",
  cashCollected:
    "Collected Cash: non-void posted invoice payment allocations, payment_date (paid_at fallback) in period. Deposits are not added again. Each amount is an allocation, not necessarily the full received payment.",
  expenses:
    "Expenses: eligible expense_lines.amount, expense_date in period; project scope uses line project with header fallback. Draft, void, legacy, invalid and unapproved inbox uploads excluded. Not proof of cash settlement.",
  laborCost:
    "Labor Cost: Approved/Locked labor_entries.cost_amount, work_date in period. Accrued labor, not labor payments.",
  subcontractorCost:
    "Approved Subcontract Cost: Approved subcontract_bills.amount, bill_date in period. Not generic AP or subcontract payments.",
  billsAp:
    "Outstanding AP: current ap_bills open balance, all issue dates; Pending/Partially Paid only. Draft, Paid, Void, legacy bills, worker and subcontract ledgers excluded. Aging uses today, not the report period end.",
  outstandingAr:
    "Outstanding AR: current eligible invoice total minus non-void payment allocations, floored at zero, all issue/payment dates. Aging uses today, not historical period-end balances.",
};

type DbErrorLike = { message?: string } | null;
type QueryResponse<T> = { data: T[] | null; error: DbErrorLike };

type InvoiceRow = {
  id: string;
  project_id: string | null;
  customer_id: string | null;
  invoice_no: string | null;
  client_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  total: number | string | null;
  paid_total: number | string | null;
  balance_due: number | string | null;
};

type InvoicePaymentRow = {
  id: string;
  invoice_id: string | null;
  amount: number | string | null;
  payment_date: string | null;
  paid_at: string | null;
  status: string | null;
  payment_received_id?: string | null;
};

type ExpenseRow = {
  receipt_url?: string | null;
  vendor?: string | null;
  vendor_name?: string | null;
  id: string;
  project_id: string | null;
  expense_date: string | null;
  created_at: string | null;
  total: number | string | null;
  amount: number | string | null;
  status: string | null;
  reference_no: string | null;
};

type LaborEntryRow = {
  id: string;
  project_id: string | null;
  worker_id: string | null;
  work_date: string | null;
  cost_amount: number | string | null;
  amount_snapshot: number | string | null;
  labor_cost_snapshot: number | string | null;
  status: string | null;
  worker_payment_id: string | null;
};

type WorkerPaymentRow = {
  id: string;
  worker_id: string | null;
  total_amount: number | string | null;
  labor_entry_ids: unknown;
  payment_date: string | null;
  created_at: string | null;
};

type ApBillRow = {
  id: string;
  bill_no: string | null;
  vendor_name: string | null;
  project_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  balance_amount: number | string | null;
  status: string | null;
  bill_type: string | null;
};

type LegacyBillRow = {
  id: string;
  vendor_name: string | null;
  project_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | string | null;
  status: string | null;
  bill_type: string | null;
};

type SubcontractBillRow = {
  id: string;
  project_id: string | null;
  bill_date: string | null;
  due_date: string | null;
  amount: number | string | null;
  description: string | null;
  status: string | null;
};

type ProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  budget: number | string | null;
  contract_amount: number | string | null;
  client: string | null;
  client_name: string | null;
  customer_id: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  company_name: string | null;
};

const AGING_BUCKETS: AgingBucketName[] = ["Current", "1-30", "31-60", "61-90", "90+"];

function toMoney(value: unknown): number {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function isVoidLikeStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return (
    s === "void" ||
    s === "voided" ||
    s === "cancelled" ||
    s === "canceled" ||
    s === "rejected" ||
    s === "deleted"
  );
}

function isDraftLikeStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "draft";
}

function expenseCountsTowardReports(status: string | null | undefined): boolean {
  return [
    "pending",
    "needs_review",
    "reviewed",
    "approved",
    "reimbursed",
    "reimbursable",
    "paid",
  ].includes(normalizeStatus(status));
}

function laborCountsTowardReportsCost(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "approved" || s === "locked";
}

function subcontractCountsTowardReportsCost(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "approved";
}

function ymd(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return ymd(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const diff = Math.floor((b.getTime() - a.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)));
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const sliced = value.slice(0, 10);
  if (!isIsoDate(sliced)) return null;
  const parsed = new Date(`${sliced}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === sliced
    ? sliced
    : null;
}

function dateInRange(
  value: string | null | undefined,
  range: Pick<ReportDateRange, "start" | "end">
) {
  const d = dateOnly(value);
  return Boolean(d && d >= range.start && d <= range.end);
}

function rangeLabel(period: ReportsPeriod, start: string, end: string): string {
  if (period === "this-month") return "This Month";
  if (period === "last-month") return "Last Month";
  if (period === "this-quarter") return "This Quarter";
  if (period === "this-year") return "This Year";
  return `${start} to ${end}`;
}

export function normalizeReportsPeriod(raw: string | string[] | undefined): ReportsPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "all-time" ||
    value === "this-month" ||
    value === "last-month" ||
    value === "this-quarter" ||
    value === "this-year" ||
    value === "custom"
  ) {
    return value;
  }
  return "this-month";
}

export function normalizeReportsTab(raw: string | string[] | undefined): ReportsTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "project-profitability" ||
    value === "ar-aging" ||
    value === "ap-aging" ||
    value === "monthly"
  ) {
    return value;
  }
  return "monthly";
}

export function getReportDateRange(input?: {
  period?: string | string[];
  from?: string | string[];
  to?: string | string[];
  now?: Date;
}): ReportDateRange {
  const now = input?.now ?? new Date();
  const period = normalizeReportsPeriod(input?.period);
  if (period === "all-time")
    return {
      period,
      label: "All time",
      start: "0001-01-01",
      end: "9999-12-31",
      previousStart: "",
      previousEnd: "",
    };
  const year = now.getFullYear();
  const month = now.getMonth();

  let startDate = new Date(year, month, 1);
  let endDate = new Date(year, month + 1, 0);

  if (period === "last-month") {
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0);
  } else if (period === "this-quarter") {
    const quarterStart = Math.floor(month / 3) * 3;
    startDate = new Date(year, quarterStart, 1);
    endDate = new Date(year, quarterStart + 3, 0);
  } else if (period === "this-year") {
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
  } else if (period === "custom") {
    const from = dateOnly(Array.isArray(input?.from) ? input?.from[0] : input?.from);
    const to = dateOnly(Array.isArray(input?.to) ? input?.to[0] : input?.to);
    if (from && to) {
      startDate = new Date(`${from}T00:00:00`);
      endDate = new Date(`${to}T00:00:00`);
      if (ymd(startDate) > ymd(endDate)) {
        const tmp = startDate;
        startDate = endDate;
        endDate = tmp;
      }
    }
  }

  const start = ymd(startDate);
  const end = ymd(endDate);
  const days = daysBetweenInclusive(start, end);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  return {
    period,
    label: rangeLabel(period, start, end),
    start,
    end,
    previousStart,
    previousEnd,
  };
}

function safeRows<T>(response: QueryResponse<T>, label: string, warnings: string[]): T[] {
  void warnings;
  if (response.error) {
    throw new Error(`${label} unavailable: ${response.error.message ?? "query failed"}`);
  }
  if (!Array.isArray(response.data)) throw new Error(`${label} unavailable: invalid result`);
  return response.data;
}

function sumInvoicePaymentsByInvoice(payments: InvoicePaymentRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const payment of payments) {
    const invoiceId = String(payment.invoice_id ?? "").trim();
    if (
      !invoiceId ||
      isVoidLikeStatus(payment.status) ||
      !["posted", "recorded", ""].includes(normalizeStatus(payment.status)) ||
      !Number.isFinite(Number(payment.amount))
    )
      continue;
    map.set(invoiceId, (map.get(invoiceId) ?? 0) + toMoney(payment.amount));
  }
  return map;
}

function invoiceBalance(invoice: InvoiceRow, paymentSumByInvoiceId: Map<string, number>): number {
  if (!invoiceCountsTowardRevenue(invoice.status)) return 0;
  const total = toMoney(invoice.total);
  const paid = paymentSumByInvoiceId.get(invoice.id) ?? 0;
  return toMoney(Math.max(0, total - paid));
}

function apBillOpenBalance(row: ApBillRow): number {
  if (!billCountsTowardReports(row.status)) return 0;
  const amount = toMoney(row.amount);
  const paid = toMoney(row.paid_amount);
  const stored = toMoney(row.balance_amount);
  const derived = Math.max(0, amount - paid);
  if (stored <= 0 && derived > 0) return toMoney(derived);
  return toMoney(Math.max(0, stored));
}

function subcontractBillOpenBalance(row: SubcontractBillRow): number {
  if (
    isVoidLikeStatus(row.status) ||
    isDraftLikeStatus(row.status) ||
    normalizeStatus(row.status) === "paid"
  )
    return 0;
  return toMoney(Math.max(0, toMoney(row.amount)));
}

function laborEntryAmount(row: LaborEntryRow): number {
  return toMoney(row.labor_cost_snapshot ?? row.amount_snapshot ?? row.cost_amount);
}

function emptyBuckets(): AgingBucket[] {
  return AGING_BUCKETS.map((bucket) => ({ bucket, amount: 0, count: 0 }));
}

function agingBucketFor(dueDate: string | null, today: string): AgingBucketName {
  if (!dueDate || dueDate >= today) return "Current";
  const days = Math.floor(
    (new Date(`${today}T00:00:00`).getTime() - new Date(`${dueDate}T00:00:00`).getTime()) /
      86_400_000
  );
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function bucketRows(rows: AgingRow[]): AgingBucket[] {
  const buckets = emptyBuckets();
  const byName = new Map(buckets.map((bucket) => [bucket.bucket, bucket]));
  for (const row of rows) {
    const bucket = byName.get(row.bucket);
    if (!bucket) continue;
    bucket.amount = toMoney(bucket.amount + row.amount);
    bucket.count += 1;
  }
  return buckets;
}

function amountDeltaPct(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function makeKpi(
  key: ReportsKpiKey,
  label: string,
  value: number,
  previousValue: number,
  kind: "currency" | "percent" | "count" = "currency",
  tone: ReportsKpi["tone"] = "neutral"
): ReportsKpi {
  const roundedValue = kind === "percent" ? value : toMoney(value);
  const roundedPrevious = kind === "percent" ? previousValue : toMoney(previousValue);
  return {
    key,
    label,
    value: roundedValue,
    previousValue: roundedPrevious,
    delta:
      kind === "percent" ? roundedValue - roundedPrevious : toMoney(roundedValue - roundedPrevious),
    deltaPct: amountDeltaPct(roundedValue, roundedPrevious),
    kind,
    tone,
  };
}

function projectName(project: ProjectRow | undefined, id: string): string {
  return (project?.name ?? "").trim() || `Project ${id.slice(0, 8)}`;
}

function customerNameForProject(
  project: ProjectRow | undefined,
  customersById: Map<string, CustomerRow>
) {
  const customerId = String(project?.customer_id ?? "").trim();
  const customer = customerId ? customersById.get(customerId) : undefined;
  return (
    (customer?.company_name ?? "").trim() ||
    (customer?.name ?? "").trim() ||
    (project?.client_name ?? "").trim() ||
    (project?.client ?? "").trim() ||
    "Unassigned"
  );
}

function buildArAging(input: {
  invoices: InvoiceRow[];
  payments: InvoicePaymentRow[];
  projects: ProjectRow[];
}): ReportsData["arAging"] {
  const today = ymd(new Date());
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const paymentSumByInvoice = sumInvoicePaymentsByInvoice(input.payments);
  const rows: AgingRow[] = [];

  for (const invoice of input.invoices) {
    const amount = invoiceBalance(invoice, paymentSumByInvoice);
    if (amount <= 0.005) continue;
    const dueDate = dateOnly(invoice.due_date);
    const project = invoice.project_id ? projectsById.get(invoice.project_id) : undefined;
    const bucket = agingBucketFor(dueDate, today);
    rows.push({
      id: invoice.id,
      label: invoice.invoice_no || "Invoice",
      counterparty: (invoice.client_name ?? "").trim() || "Unassigned",
      project: invoice.project_id ? projectName(project, invoice.project_id) : "Unassigned",
      dueDate,
      amount,
      bucket,
      source: "Invoice",
      customerId: invoice.customer_id,
    });
  }

  rows.sort((a, b) => b.amount - a.amount);
  return { buckets: bucketRows(rows), rows };
}

function buildApAging(input: {
  apBills: ApBillRow[];
  legacyBills: LegacyBillRow[];
  subcontractBills: SubcontractBillRow[];
  laborEntries: LaborEntryRow[];
  workerPayments: WorkerPaymentRow[];
  projects: ProjectRow[];
}): ReportsData["apAging"] {
  const today = ymd(new Date());
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const rows: AgingRow[] = [];

  for (const bill of input.apBills) {
    const amount = apBillOpenBalance(bill);
    if (amount <= 0.005) continue;
    const dueDate = dateOnly(bill.due_date);
    const bucket = agingBucketFor(dueDate, today);
    rows.push({
      id: bill.id,
      label: bill.bill_no || "AP Bill",
      counterparty: (bill.vendor_name ?? "").trim() || "Vendor",
      project: bill.project_id
        ? projectName(projectsById.get(bill.project_id), bill.project_id)
        : "Unassigned",
      dueDate,
      amount,
      bucket,
      source: "Bills / AP",
    });
  }

  for (const bill of input.subcontractBills) {
    const amount = subcontractBillOpenBalance(bill);
    if (amount <= 0.005) continue;
    const dueDate = dateOnly(bill.due_date) ?? dateOnly(bill.bill_date);
    const bucket = agingBucketFor(dueDate, today);
    rows.push({
      id: bill.id,
      label: (bill.description ?? "").trim() || "Subcontractor Bill",
      counterparty: "Subcontractor",
      project: bill.project_id
        ? projectName(projectsById.get(bill.project_id), bill.project_id)
        : "Unassigned",
      dueDate,
      amount,
      bucket,
      source: "Subcontractor Bills",
    });
  }

  const paymentIdByLaborEntryId = laborEntryPaymentIdMapFromWorkerPayments(input.workerPayments);
  for (const entry of input.laborEntries) {
    const effectivePaymentId =
      String(entry.worker_payment_id ?? "").trim() ||
      paymentIdByLaborEntryId.get(String(entry.id ?? "")) ||
      null;
    if (!isLaborUnpaidForWorkerPayroll(entry.status, effectivePaymentId, "payment_link")) continue;
    const amount = laborEntryAmount(entry);
    if (amount <= 0.005) continue;
    const dueDate = dateOnly(entry.work_date);
    const bucket = agingBucketFor(dueDate, today);
    rows.push({
      id: entry.id,
      label: "Worker payable",
      counterparty: "Worker",
      project: entry.project_id
        ? projectName(projectsById.get(entry.project_id), entry.project_id)
        : "Unassigned",
      dueDate,
      amount,
      bucket,
      source: "Worker Payable",
    });
  }

  rows.sort((a, b) => b.amount - a.amount);
  return { buckets: bucketRows(rows), rows };
}

export async function getReportsData(
  range: ReportDateRange,
  explicitClient?: SupabaseClient,
  scope: {
    projectId?: string;
    customerId?: string;
    dueFrom?: string;
    dueTo?: string;
    asOf?: string;
  } = {}
): Promise<ReportsData> {
  if (scope.asOf !== undefined)
    throw new Error(
      "Historical AR/AP unavailable with current data: dated void, edit and reversal history is incomplete."
    );
  const warnings: string[] = [];
  const supabase = explicitClient ?? getServerSupabaseInternalNoStore();

  if (!supabase) throw new Error("Reports unavailable: Supabase not configured");

  const [
    invoicesRes,
    paymentsRes,
    expensesRes,
    laborEntriesRes,
    workerPaymentsRes,
    apBillsRes,
    expenseLinesRes,
    subcontractBillsRes,
    projectsRes,
    customersRes,
    legacyAttachmentsRes,
    expenseAttachmentsRes,
    apPaymentsRes,
  ] = await Promise.all([
    readCompleteRows(() =>
      supabase
        .from("invoices")
        .select(
          "id, project_id, customer_id, invoice_no, client_name, issue_date, due_date, status, total, paid_total, balance_due",
          { count: "exact" }
        )
    ),
    readCompleteRows(() =>
      supabase
        .from("invoice_payments")
        .select("id, invoice_id, amount, payment_date, paid_at, status, payment_received_id", {
          count: "exact",
        })
    ),
    readCompleteRows(() =>
      supabase
        .from("expenses")
        .select(
          "id, project_id, expense_date, created_at, total, amount, status, reference_no, receipt_url, vendor, vendor_name",
          { count: "exact" }
        )
    ),
    readCompleteRows(() =>
      supabase
        .from("labor_entries")
        .select(
          "id, project_id, worker_id, work_date, cost_amount, amount_snapshot, labor_cost_snapshot, status, worker_payment_id",
          { count: "exact" }
        )
    ),
    readCompleteRows(
      () =>
        supabase
          .from("worker_payments")
          .select("id, worker_id, total_amount, labor_entry_ids, payment_date, created_at", {
            count: "exact",
          }),
      "worker_payments"
    ),
    readCompleteRows(() =>
      supabase
        .from("ap_bills")
        .select(
          "id, bill_no, bill_type, vendor_name, project_id, issue_date, due_date, amount, paid_amount, balance_amount, status",
          { count: "exact" }
        )
    ),
    readCompleteRows(() =>
      supabase
        .from("expense_lines")
        .select("id, expense_id, project_id, amount", { count: "exact" })
    ),
    readCompleteRows(() =>
      supabase
        .from("subcontract_bills")
        .select("id, project_id, bill_date, due_date, amount, description, status", {
          count: "exact",
        })
    ),
    readCompleteRows(() =>
      supabase
        .from("projects")
        .select("id, name, status, budget, contract_amount, client, client_name, customer_id", {
          count: "exact",
        })
    ),
    readCompleteRows(() =>
      supabase.from("customers").select("id, name, company_name", { count: "exact" })
    ),
    readCompleteRows(() =>
      supabase
        .from("attachments")
        .select("id, entity_id, file_path", { count: "exact" })
        .eq("entity_type", "expense")
    ),
    readCompleteRows(() =>
      supabase.from("expense_attachments").select("id, expense_id, file_url", { count: "exact" })
    ),
    readCompleteRows(() =>
      supabase
        .from("ap_bill_payments")
        .select("id, bill_id, payment_date, amount", { count: "exact" })
    ),
  ]);

  const invoices = safeRows(invoicesRes as QueryResponse<InvoiceRow>, "invoices", warnings);
  const payments = safeRows(
    paymentsRes as QueryResponse<InvoicePaymentRow>,
    "invoice_payments",
    warnings
  );
  const expenses = safeRows(expensesRes as QueryResponse<ExpenseRow>, "expenses", warnings);
  const laborEntries = safeRows(
    laborEntriesRes as QueryResponse<LaborEntryRow>,
    "labor_entries",
    warnings
  );
  const workerPayments = safeRows(
    workerPaymentsRes as QueryResponse<WorkerPaymentRow>,
    "worker_payments",
    warnings
  );
  const apBills = safeRows(apBillsRes as QueryResponse<ApBillRow>, "ap_bills", warnings);
  const expenseLines = safeRows(
    expenseLinesRes as QueryResponse<{
      id: string;
      expense_id: string;
      project_id: string | null;
      amount: number;
    }>,
    "expense_lines",
    warnings
  );
  const subcontractBills = safeRows(
    subcontractBillsRes as QueryResponse<SubcontractBillRow>,
    "subcontract_bills",
    warnings
  );
  const projects = safeRows(projectsRes as QueryResponse<ProjectRow>, "projects", warnings);
  const customers = safeRows(customersRes as QueryResponse<CustomerRow>, "customers", warnings);

  const apPayments = safeRows(
    apPaymentsRes as QueryResponse<{
      id: string;
      bill_id: string;
      payment_date: string;
      amount: number;
    }>,
    "ap_bill_payments",
    warnings
  );
  const projectIds = projects
    .filter(
      (p) =>
        (!scope.projectId || p.id === scope.projectId) &&
        (!scope.customerId || p.customer_id === scope.customerId)
    )
    .map((p) => p.id);
  const matchesScope = (
    projectId: string | null,
    customerId?: string | null,
    explicitCustomer = false
  ) =>
    (!scope.projectId ||
      (scope.projectId === "unassigned" ? !projectId : projectId === scope.projectId)) &&
    (!scope.customerId ||
      (explicitCustomer
        ? customerId === scope.customerId
        : Boolean(projectId && projectIds.includes(projectId))));
  const matchesDue = (date: string | null | undefined) =>
    (!scope.dueFrom || (!!date && date >= scope.dueFrom)) &&
    (!scope.dueTo || (!!date && date <= scope.dueTo));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const records = Object.fromEntries(
    Object.keys(REPORT_DEFINITIONS).map((k) => [k, [] as ReportRecord[]])
  ) as Record<ReportsKpiKey, ReportRecord[]>;
  const allRecords = Object.fromEntries(
    Object.keys(REPORT_DEFINITIONS).map((k) => [k, [] as ReportRecord[]])
  ) as Record<ReportsKpiKey, ReportRecord[]>;
  const previous = Object.fromEntries(
    Object.keys(REPORT_DEFINITIONS).map((k) => [k, [] as ReportRecord[]])
  ) as Record<ReportsKpiKey, ReportRecord[]>;
  const add = (key: ReportsKpiKey, record: ReportRecord, currentBalance = false) => {
    if (!matchesScope(record.projectId, record.customerId, Object.hasOwn(record, "customerId")))
      return;
    if ((key === "billsAp" || key === "outstandingAr") && !matchesDue(record.dueDate)) return;
    if (!Number.isFinite(record.amount)) {
      warnings.push(`Invalid amount excluded: ${record.source}/${record.id}`);
      return;
    }
    allRecords[key].push(record);
    if (currentBalance || dateInRange(record.date, range)) records[key].push(record);
    if (
      !currentBalance &&
      dateInRange(record.date, { start: range.previousStart, end: range.previousEnd })
    )
      previous[key].push(record);
  };
  const paid = sumInvoicePaymentsByInvoice(payments);
  for (const row of invoices) {
    if (!invoiceCountsTowardRevenue(row.status)) continue;
    const record = {
      id: row.id,
      label: row.invoice_no || row.id,
      amount: Number(row.total),
      date: row.issue_date,
      dueDate: row.due_date,
      status: row.status || "",
      projectId: row.project_id,
      customerId: row.customer_id,
      href: `/financial/invoices/${row.id}`,
      source: "invoices",
    };
    add("invoicedRevenue", record);
    const balance = invoiceBalance(row, paid);
    if (balance > 0) add("outstandingAr", { ...record, amount: balance }, true);
  }
  for (const row of payments) {
    if (
      isVoidLikeStatus(row.status) ||
      !["posted", "recorded", ""].includes(normalizeStatus(row.status))
    )
      continue;
    const invoice = invoiceById.get(row.invoice_id || "");
    if (!invoice || !invoiceCountsTowardRevenue(invoice.status)) continue;
    add("cashCollected", {
      id: row.id,
      label: `Payment allocation · ${invoice.invoice_no || invoice.id}`,
      amount: Number(row.amount),
      date: dateOnly(row.payment_date) ?? dateOnly(row.paid_at),
      status: row.status || "Posted",
      projectId: invoice.project_id,
      customerId: invoice.customer_id,
      href: row.payment_received_id
        ? `/financial/payments?paymentId=${row.payment_received_id}&paymentDetail=${row.payment_received_id}`
        : `/financial/invoices/${invoice.id}`,
      source: "invoice_payments",
    });
  }
  const expensesById = new Map(expenses.map((e) => [e.id, e]));
  for (const line of expenseLines) {
    const row = expensesById.get(line.expense_id);
    if (
      !row ||
      !expenseCountsTowardReports(row.status) ||
      !expenseCountsTowardCanonicalProjectCost(row)
    )
      continue;
    add("expenses", {
      id: line.id,
      label: `Expense ${row.id} · line ${line.id}`,
      amount: Number(line.amount),
      date: row.expense_date,
      status: row.status || "",
      projectId: line.project_id ?? row.project_id,
      href: `/financial/expenses/${row.id}`,
      source: "expense_lines",
    });
  }
  for (const row of laborEntries) {
    if (!laborCountsTowardReportsCost(row.status)) continue;
    add("laborCost", {
      id: row.id,
      label: `Labor ${row.id}`,
      amount: Number(row.cost_amount),
      date: row.work_date,
      status: row.status || "",
      projectId: row.project_id,
      href: `/labor/entries?date=${row.work_date || ""}&selectedRecord=${row.id}`,
      source: "labor_entries",
    });
  }
  for (const row of subcontractBills) {
    if (!subcontractCountsTowardReportsCost(row.status)) continue;
    add("subcontractorCost", {
      id: row.id,
      label: row.description || row.id,
      amount: Number(row.amount),
      date: row.bill_date,
      status: row.status || "",
      projectId: row.project_id,
      href: `/projects/${row.project_id}?tab=financial`,
      source: "subcontract_bills",
    });
  }
  for (const row of apBills) {
    const amount = apBillOpenBalance(row);
    if (amount <= 0) continue;
    add(
      "billsAp",
      {
        id: row.id,
        label: row.bill_no || row.id,
        amount,
        date: row.issue_date,
        dueDate: row.due_date,
        status: row.status || "",
        projectId: row.project_id,
        href: `/bills/${row.id}`,
        source: "ap_bills",
      },
      true
    );
  }
  const receiptExpenseIds = new Set<string>();
  for (const row of legacyAttachmentsRes.data) {
    if (row.file_path?.trim()) receiptExpenseIds.add(row.entity_id);
  }
  for (const row of expenseAttachmentsRes.data) {
    if (row.file_url?.trim()) receiptExpenseIds.add(row.expense_id);
  }
  const linesByExpense = new Map<string, typeof expenseLines>();
  for (const line of expenseLines) {
    const lines = linesByExpense.get(line.expense_id) ?? [];
    lines.push(line);
    linesByExpense.set(line.expense_id, lines);
  }
  for (const expense of expenses) {
    if (
      isVoidLikeStatus(expense.status) ||
      ["legacy", "invalid"].includes(normalizeStatus(expense.status)) ||
      !expenseMatchesInboxPool({ status: expenseStatusForDatabase(expense.status) }) ||
      expenseHasReceiptSignal(expense.receipt_url, receiptExpenseIds.has(expense.id) ? 1 : 0)
    )
      continue;
    const lines = linesByExpense.get(expense.id) ?? [];
    const candidates = lines.length
      ? lines.map((l) => l.project_id ?? expense.project_id ?? null)
      : [expense.project_id ?? null];
    const projectId = candidates.find((id) => matchesScope(id));
    if (projectId === undefined) continue;
    add("missingReceipts", {
      id: expense.id,
      label: expense.vendor || expense.vendor_name || expense.id,
      amount: 1,
      date: expense.expense_date,
      status: expense.status || "pending",
      projectId,
      href: `/financial/inbox?ops_record=${expense.id}&dateRange=all`,
      source: "expenses + receipt attachments",
    });
  }
  const apBillsById = new Map(apBills.map((b) => [b.id, b]));
  for (const payment of apPayments) {
    const bill = apBillsById.get(payment.bill_id);
    if (!bill) throw new Error(`AP payment bill unavailable: ${payment.id}`);
    add("paidAp", {
      id: payment.id,
      label: `AP payment ${payment.id} · ${bill.bill_no || bill.id}`,
      amount: Number(payment.amount),
      date: payment.payment_date,
      status: "Recorded; reversal status unavailable",
      projectId: bill.project_id,
      href: `/bills/${bill.id}`,
      source: "ap_bill_payments",
    });
  }
  const sum = (rows: ReportRecord[]) => toMoney(rows.reduce((n, r) => n + r.amount, 0));
  const labels: Record<ReportsKpiKey, string> = {
    invoicedRevenue: "Invoiced Revenue",
    cashCollected: "Collected Cash",
    expenses: "Expenses",
    laborCost: "Labor Cost",
    subcontractorCost: "Approved Subcontract Cost",
    billsAp: "Outstanding AP · current",
    outstandingAr: "Outstanding AR · current",
    missingReceipts: "Inbox Missing Receipts",
    projectBudget: "Project Base Contract · lifetime",
    projectCost: "Reviewed Project Cost · lifetime",
    projectProfit: "Reviewed Project Profit · lifetime",
    paidAp: "AP Payments",
  };

  const canonical = new Map<string, CanonicalProjectProfit>();
  for (let i = 0; i < projectIds.length; i += 100) {
    for (const [id, value] of await getCanonicalProjectProfitBatch(
      projectIds.slice(i, i + 100),
      supabase
    ))
      canonical.set(id, value);
  }
  const review = getProjectContractReviewSummary(
    projects
      .filter((p) => projectIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name || "",
        budget: p.budget,
        contractAmount: p.contract_amount,
      }))
  );
  const projectReviewWarning = review.needsReviewCount
    ? `${review.needsReviewCount} projects excluded from profit: contract review required.`
    : undefined;
  const blockedProjects = new Set(
    expenseLines.flatMap((line) => {
      const expense = expensesById.get(line.expense_id);
      const id = line.project_id ?? expense?.project_id;
      return id &&
        expense &&
        Number(line.amount) !== 0 &&
        !expenseCountsTowardReports(expense.status) &&
        expenseCountsTowardCanonicalProjectCost(expense)
        ? [id]
        : [];
    })
  );
  const blockedCount = review.readyProjectIds.filter((id) => blockedProjects.has(id)).length;
  if (blockedCount)
    warnings.push(
      `${blockedCount} project profit totals withheld: expense eligibility requires financial authority review.`
    );
  const projectRows = review.readyProjectIds
    .filter((id) => !blockedProjects.has(id))
    .map((id) => {
      const p = projectsById.get(id)!;
      const c = canonical.get(id) as CanonicalProjectProfit;
      if (!c) throw new Error(`Project profit unavailable: ${id}`);
      const allInvoices = invoices.filter(
        (i) => i.project_id === id && invoiceCountsTowardRevenue(i.status)
      );
      return {
        projectId: id,
        project: projectName(p, id),
        customer: customerNameForProject(p, customersById),
        invoiceContractAmount: c.revenue,
        collected: toMoney(allInvoices.reduce((n, i) => n + (paid.get(i.id) || 0), 0)),
        expenses: c.expenseCost,
        labor: c.laborCost,
        billsSubcontractors: c.subcontractCost + c.commissionCost,
        totalCost: c.actualCost,
        profit: c.profit,
        marginPct: c.margin * 100,
        openAr: toMoney(allInvoices.reduce((n, i) => n + invoiceBalance(i, paid), 0)),
        openAp: toMoney(
          apBills.filter((b) => b.project_id === id).reduce((n, b) => n + apBillOpenBalance(b), 0)
        ),
        status: p.status || "Unknown",
      };
    })
    .sort((a, b) => b.profit - a.profit);
  for (const project of projects.filter((p) => projectIds.includes(p.id))) {
    add(
      "projectBudget",
      {
        id: project.id,
        label: project.name || project.id,
        amount: Number(project.budget),
        date: null,
        status: project.status || "Unknown",
        projectId: project.id,
        href: `/projects/${project.id}?tab=financial`,
        source: "projects.budget",
      },
      true
    );
  }
  for (const project of projectRows) {
    const record = {
      id: project.projectId,
      label: project.project,
      date: null,
      status: "Contract reviewed",
      projectId: project.projectId,
      href: `/projects/${project.projectId}?tab=financial`,
      source: "profit-engine",
    };
    add("projectCost", { ...record, amount: project.totalCost }, true);
    add("projectProfit", { ...record, amount: project.profit }, true);
  }
  const monthlyKpis = (Object.keys(labels) as ReportsKpiKey[]).map((key) =>
    makeKpi(
      key,
      labels[key],
      sum(records[key]),
      sum(previous[key]),
      key === "missingReceipts" ? "count" : "currency"
    )
  );
  const now = new Date();
  const cashFlow = [5, 4, 3, 2, 1, 0].map((back) => {
    const start = ymd(new Date(now.getFullYear(), now.getMonth() - back, 1));
    const end = ymd(new Date(now.getFullYear(), now.getMonth() - back + 1, 0));
    const month = { start, end };
    return {
      label: start.slice(0, 7),
      start,
      end,
      income: sum(allRecords.cashCollected.filter((r) => dateInRange(r.date, month))),
      expense: sum(
        [...allRecords.expenses, ...allRecords.laborCost].filter((r) => dateInRange(r.date, month))
      ),
    };
  });
  const scopedInvoices = invoices.filter(
    (i) => matchesScope(i.project_id, i.customer_id, true) && matchesDue(i.due_date)
  );
  const liabilities = buildApAging({
    apBills: apBills.filter((b) => matchesScope(b.project_id) && matchesDue(b.due_date)),
    legacyBills: [],
    subcontractBills: subcontractBills.filter((b) => matchesScope(b.project_id)),
    laborEntries: laborEntries.filter((e) => matchesScope(e.project_id)),
    workerPayments,
    projects,
  });
  const apRows = liabilities.rows.filter((r) => r.source === "Bills / AP");
  const otherRows = liabilities.rows.filter((r) => r.source !== "Bills / AP");
  return {
    range,
    cashFlow,
    records,
    definitions: Object.fromEntries(
      Object.entries(REPORT_DEFINITIONS).map(([key, text]) => [
        key,
        text +
          ((key === "billsAp" || key === "outstandingAr") && (scope.dueFrom || scope.dueTo)
            ? ` Due-date scope: ${scope.dueFrom || "any"} to ${scope.dueTo || "any"}.`
            : ""),
      ])
    ) as Record<ReportsKpiKey, string>,
    projectReviewWarning,
    monthly: {
      kpis: monthlyKpis,
      hasActivity: monthlyKpis.some(
        (k) =>
          !["billsAp", "outstandingAr", "projectBudget", "projectCost", "projectProfit"].includes(
            k.key
          ) && Math.abs(k.value) > 0.005
      ),
    },
    projectProfitability: { rows: projectRows },
    arAging: buildArAging({ invoices: scopedInvoices, payments, projects }),
    apAging: { rows: apRows, buckets: bucketRows(apRows) },
    otherPayables: { rows: otherRows, buckets: bucketRows(otherRows) },
    warnings,
    sources: [
      "invoices",
      "invoice_payments",
      "expenses",
      "expense_lines",
      "ap_bills",
      "subcontract_bills",
      "labor_entries",
      "worker_payments",
      "ap_bill_payments",
      "projects",
      "customers",
      "profit-engine",
    ],
  };
}
