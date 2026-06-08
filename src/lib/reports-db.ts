import "server-only";

import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import {
  isLaborUnpaidForWorkerPayroll,
  laborEntryPaymentIdMapFromWorkerPayments,
} from "@/lib/labor-balance-shared";

export type ReportsTab = "monthly" | "project-profitability" | "ar-aging" | "ap-aging";

export type ReportsPeriod = "this-month" | "last-month" | "this-quarter" | "this-year" | "custom";

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
  | "grossProfit"
  | "netProfit"
  | "profitMargin";

export type ReportsKpi = {
  key: ReportsKpiKey;
  label: string;
  value: number;
  previousValue: number;
  delta: number;
  deltaPct: number | null;
  kind: "currency" | "percent";
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
  project: string;
  dueDate: string | null;
  amount: number;
  bucket: AgingBucketName;
  source: string;
};

export type ReportsData = {
  range: ReportDateRange;
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
  warnings: string[];
  sources: string[];
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
};

type ExpenseRow = {
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
  amount: number | string | null;
  labor_entry_ids: unknown;
  project_id: string | null;
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

function invoiceCountsTowardRevenue(status: string | null | undefined): boolean {
  return !isVoidLikeStatus(status) && !isDraftLikeStatus(status);
}

function expenseCountsTowardReports(status: string | null | undefined): boolean {
  return !isVoidLikeStatus(status) && !isDraftLikeStatus(status);
}

function laborCountsTowardReportsCost(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "approved" || s === "locked";
}

function subcontractCountsTowardReportsCost(status: string | null | undefined): boolean {
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

function billCountsTowardReports(status: string | null | undefined): boolean {
  return (
    !isVoidLikeStatus(status) && !isDraftLikeStatus(status) && normalizeStatus(status) !== "paid"
  );
}

function ymd(date: Date): string {
  const y = String(date.getFullYear());
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
  return isIsoDate(sliced) ? sliced : null;
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
  if (response.error) {
    warnings.push(`${label}: ${response.error.message ?? "query failed"}`);
    return [];
  }
  return response.data ?? [];
}

function sumInvoicePaymentsByInvoice(payments: InvoicePaymentRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const payment of payments) {
    const invoiceId = String(payment.invoice_id ?? "").trim();
    if (!invoiceId || isVoidLikeStatus(payment.status)) continue;
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

function legacyBillOpenBalance(row: LegacyBillRow): number {
  if (!billCountsTowardReports(row.status)) return 0;
  return toMoney(Math.max(0, toMoney(row.amount)));
}

function subcontractBillOpenBalance(row: SubcontractBillRow): number {
  if (!billCountsTowardReports(row.status)) return 0;
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
  kind: "currency" | "percent" = "currency",
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

function addToMap(map: Map<string, number>, key: string | null | undefined, amount: number) {
  const clean = String(key ?? "").trim();
  if (!clean) return;
  map.set(clean, toMoney((map.get(clean) ?? 0) + amount));
}

function buildMonthlyKpis(input: {
  range: ReportDateRange;
  invoices: InvoiceRow[];
  payments: InvoicePaymentRow[];
  expenses: ExpenseRow[];
  laborEntries: LaborEntryRow[];
  apBills: ApBillRow[];
  legacyBills: LegacyBillRow[];
  subcontractBills: SubcontractBillRow[];
}): ReportsData["monthly"] {
  const summarize = (start: string, end: string) => {
    const window = { start, end };
    const invoicedRevenue = input.invoices.reduce((sum, invoice) => {
      if (!invoiceCountsTowardRevenue(invoice.status) || !dateInRange(invoice.issue_date, window))
        return sum;
      return sum + toMoney(invoice.total);
    }, 0);
    const cashCollected = input.payments.reduce((sum, payment) => {
      const paymentDate = dateOnly(payment.payment_date) ?? dateOnly(payment.paid_at);
      if (isVoidLikeStatus(payment.status) || !dateInRange(paymentDate, window)) return sum;
      return sum + toMoney(payment.amount);
    }, 0);
    const expenses = input.expenses.reduce((sum, expense) => {
      const expenseDate = dateOnly(expense.expense_date) ?? dateOnly(expense.created_at);
      if (!expenseCountsTowardReports(expense.status) || !dateInRange(expenseDate, window))
        return sum;
      return sum + toMoney(expense.total ?? expense.amount);
    }, 0);
    const laborCost = input.laborEntries.reduce((sum, entry) => {
      if (!laborCountsTowardReportsCost(entry.status) || !dateInRange(entry.work_date, window))
        return sum;
      return sum + laborEntryAmount(entry);
    }, 0);
    const subcontractorCost = input.subcontractBills.reduce((sum, bill) => {
      const billDate = dateOnly(bill.bill_date) ?? dateOnly(bill.due_date);
      if (!subcontractCountsTowardReportsCost(bill.status) || !dateInRange(billDate, window))
        return sum;
      return sum + toMoney(bill.amount);
    }, 0);
    const billsAp =
      input.apBills.reduce((sum, bill) => {
        const billDate = dateOnly(bill.issue_date) ?? dateOnly(bill.due_date);
        if (!billCountsTowardReports(bill.status) || !dateInRange(billDate, window)) return sum;
        return sum + toMoney(bill.amount);
      }, 0) +
      input.legacyBills.reduce((sum, bill) => {
        const billDate = dateOnly(bill.issue_date) ?? dateOnly(bill.due_date);
        if (!billCountsTowardReports(bill.status) || !dateInRange(billDate, window)) return sum;
        return sum + toMoney(bill.amount);
      }, 0);
    const grossProfit = invoicedRevenue - expenses - laborCost - subcontractorCost;
    const netProfit = grossProfit - billsAp;
    const profitMargin = invoicedRevenue > 0 ? (netProfit / invoicedRevenue) * 100 : 0;
    return {
      invoicedRevenue,
      cashCollected,
      expenses,
      laborCost,
      subcontractorCost,
      billsAp,
      grossProfit,
      netProfit,
      profitMargin,
    };
  };

  const current = summarize(input.range.start, input.range.end);
  const previous = summarize(input.range.previousStart, input.range.previousEnd);
  const hasActivity = Object.entries(current)
    .filter(([key]) => key !== "profitMargin")
    .some(([, value]) => Math.abs(Number(value)) > 0.005);

  return {
    hasActivity,
    kpis: [
      makeKpi(
        "invoicedRevenue",
        "Invoiced Revenue",
        current.invoicedRevenue,
        previous.invoicedRevenue
      ),
      makeKpi(
        "cashCollected",
        "Cash Collected",
        current.cashCollected,
        previous.cashCollected,
        "currency",
        "positive"
      ),
      makeKpi("expenses", "Expenses", current.expenses, previous.expenses, "currency", "negative"),
      makeKpi(
        "laborCost",
        "Labor Cost",
        current.laborCost,
        previous.laborCost,
        "currency",
        "negative"
      ),
      makeKpi(
        "subcontractorCost",
        "Subcontractor Cost",
        current.subcontractorCost,
        previous.subcontractorCost,
        "currency",
        "negative"
      ),
      makeKpi("billsAp", "Bills / AP", current.billsAp, previous.billsAp, "currency", "warning"),
      makeKpi(
        "grossProfit",
        "Gross Profit",
        current.grossProfit,
        previous.grossProfit,
        "currency",
        current.grossProfit >= 0 ? "positive" : "negative"
      ),
      makeKpi(
        "netProfit",
        "Net Profit",
        current.netProfit,
        previous.netProfit,
        "currency",
        current.netProfit >= 0 ? "positive" : "negative"
      ),
      makeKpi(
        "profitMargin",
        "Profit Margin",
        current.profitMargin,
        previous.profitMargin,
        "percent",
        current.profitMargin >= 0 ? "positive" : "negative"
      ),
    ],
  };
}

function buildProjectProfitability(input: {
  invoices: InvoiceRow[];
  payments: InvoicePaymentRow[];
  expenses: ExpenseRow[];
  laborEntries: LaborEntryRow[];
  apBills: ApBillRow[];
  legacyBills: LegacyBillRow[];
  subcontractBills: SubcontractBillRow[];
  projects: ProjectRow[];
  customers: CustomerRow[];
}): ProjectProfitabilityRow[] {
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const customersById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const paymentSumByInvoice = sumInvoicePaymentsByInvoice(input.payments);
  const projectIds = new Set<string>(input.projects.map((project) => project.id));

  const invoicedByProject = new Map<string, number>();
  const openArByProject = new Map<string, number>();
  const collectedByProject = new Map<string, number>();
  for (const invoice of input.invoices) {
    const projectId = String(invoice.project_id ?? "").trim();
    if (!projectId) continue;
    projectIds.add(projectId);
    if (!invoiceCountsTowardRevenue(invoice.status)) continue;
    addToMap(invoicedByProject, projectId, toMoney(invoice.total));
    addToMap(openArByProject, projectId, invoiceBalance(invoice, paymentSumByInvoice));
  }
  const invoiceProjectById = new Map(
    input.invoices
      .map((invoice) => [invoice.id, invoice.project_id] as const)
      .filter(([, projectId]) => Boolean(projectId))
  );
  for (const payment of input.payments) {
    if (isVoidLikeStatus(payment.status)) continue;
    const projectId = invoiceProjectById.get(String(payment.invoice_id ?? ""));
    if (!projectId) continue;
    projectIds.add(projectId);
    addToMap(collectedByProject, projectId, toMoney(payment.amount));
  }

  const expensesByProject = new Map<string, number>();
  for (const expense of input.expenses) {
    if (!expenseCountsTowardReports(expense.status)) continue;
    addToMap(expensesByProject, expense.project_id, toMoney(expense.total ?? expense.amount));
  }

  const laborByProject = new Map<string, number>();
  for (const entry of input.laborEntries) {
    if (!laborCountsTowardReportsCost(entry.status)) continue;
    addToMap(laborByProject, entry.project_id, laborEntryAmount(entry));
  }

  const billsSubcontractorsByProject = new Map<string, number>();
  const openApByProject = new Map<string, number>();
  for (const bill of input.apBills) {
    if (!billCountsTowardReports(bill.status)) continue;
    addToMap(billsSubcontractorsByProject, bill.project_id, toMoney(bill.amount));
    addToMap(openApByProject, bill.project_id, apBillOpenBalance(bill));
  }
  for (const bill of input.legacyBills) {
    if (!billCountsTowardReports(bill.status)) continue;
    addToMap(billsSubcontractorsByProject, bill.project_id, toMoney(bill.amount));
    addToMap(openApByProject, bill.project_id, legacyBillOpenBalance(bill));
  }
  for (const bill of input.subcontractBills) {
    if (subcontractCountsTowardReportsCost(bill.status)) {
      addToMap(billsSubcontractorsByProject, bill.project_id, toMoney(bill.amount));
    }
    addToMap(openApByProject, bill.project_id, subcontractBillOpenBalance(bill));
  }

  return [...projectIds]
    .map((projectId) => {
      const project = projectsById.get(projectId);
      const contractAmount = Math.max(toMoney(project?.contract_amount), toMoney(project?.budget));
      const invoiceAmount = invoicedByProject.get(projectId) ?? 0;
      const invoiceContractAmount = Math.max(contractAmount, invoiceAmount);
      const expenses = expensesByProject.get(projectId) ?? 0;
      const labor = laborByProject.get(projectId) ?? 0;
      const billsSubcontractors = billsSubcontractorsByProject.get(projectId) ?? 0;
      const totalCost = toMoney(expenses + labor + billsSubcontractors);
      const profit = toMoney(invoiceContractAmount - totalCost);
      const marginPct = invoiceContractAmount > 0 ? (profit / invoiceContractAmount) * 100 : 0;
      return {
        projectId,
        project: projectName(project, projectId),
        customer: customerNameForProject(project, customersById),
        invoiceContractAmount,
        collected: collectedByProject.get(projectId) ?? 0,
        expenses,
        labor,
        billsSubcontractors,
        totalCost,
        profit,
        marginPct,
        openAr: openArByProject.get(projectId) ?? 0,
        openAp: openApByProject.get(projectId) ?? 0,
        status: (project?.status ?? "Unknown").trim() || "Unknown",
      };
    })
    .filter(
      (row) =>
        row.invoiceContractAmount > 0.005 ||
        row.totalCost > 0.005 ||
        row.collected > 0.005 ||
        row.openAr > 0.005 ||
        row.openAp > 0.005
    )
    .sort((a, b) => b.profit - a.profit);
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
    const dueDate = dateOnly(bill.due_date) ?? dateOnly(bill.issue_date);
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

  for (const bill of input.legacyBills) {
    const amount = legacyBillOpenBalance(bill);
    if (amount <= 0.005) continue;
    const dueDate = dateOnly(bill.due_date) ?? dateOnly(bill.issue_date);
    const bucket = agingBucketFor(dueDate, today);
    rows.push({
      id: bill.id,
      label: bill.bill_type || "Legacy Bill",
      counterparty: (bill.vendor_name ?? "").trim() || "Vendor",
      project: bill.project_id
        ? projectName(projectsById.get(bill.project_id), bill.project_id)
        : "Unassigned",
      dueDate,
      amount,
      bucket,
      source: "Bills",
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

export async function getReportsData(range: ReportDateRange): Promise<ReportsData> {
  const warnings: string[] = [];
  const supabase = getServerSupabaseInternalNoStore();

  if (!supabase) {
    warnings.push("Supabase is not configured for report reads.");
    return {
      range,
      monthly: {
        hasActivity: false,
        kpis: [
          makeKpi("invoicedRevenue", "Invoiced Revenue", 0, 0),
          makeKpi("cashCollected", "Cash Collected", 0, 0, "currency", "positive"),
          makeKpi("expenses", "Expenses", 0, 0, "currency", "negative"),
          makeKpi("laborCost", "Labor Cost", 0, 0, "currency", "negative"),
          makeKpi("subcontractorCost", "Subcontractor Cost", 0, 0, "currency", "negative"),
          makeKpi("billsAp", "Bills / AP", 0, 0, "currency", "warning"),
          makeKpi("grossProfit", "Gross Profit", 0, 0, "currency", "neutral"),
          makeKpi("netProfit", "Net Profit", 0, 0, "currency", "neutral"),
          makeKpi("profitMargin", "Profit Margin", 0, 0, "percent", "neutral"),
        ],
      },
      projectProfitability: { rows: [] },
      arAging: { buckets: emptyBuckets(), rows: [] },
      apAging: { buckets: emptyBuckets(), rows: [] },
      warnings,
      sources: [],
    };
  }

  const [
    invoicesRes,
    paymentsRes,
    expensesRes,
    laborEntriesRes,
    workerPaymentsRes,
    apBillsRes,
    legacyBillsRes,
    subcontractBillsRes,
    projectsRes,
    customersRes,
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, project_id, customer_id, invoice_no, client_name, issue_date, due_date, status, total, paid_total, balance_due"
      ),
    supabase
      .from("invoice_payments")
      .select("id, invoice_id, amount, payment_date, paid_at, status"),
    supabase
      .from("expenses")
      .select("id, project_id, expense_date, created_at, total, amount, status, reference_no"),
    supabase
      .from("labor_entries")
      .select(
        "id, project_id, worker_id, work_date, cost_amount, amount_snapshot, labor_cost_snapshot, status, worker_payment_id"
      ),
    supabase
      .from("worker_payments")
      .select(
        "id, worker_id, total_amount, amount, labor_entry_ids, project_id, payment_date, created_at"
      ),
    supabase
      .from("ap_bills")
      .select(
        "id, bill_no, bill_type, vendor_name, project_id, issue_date, due_date, amount, paid_amount, balance_amount, status"
      ),
    supabase
      .from("bills")
      .select("id, vendor_name, project_id, issue_date, due_date, amount, status, bill_type"),
    supabase
      .from("subcontract_bills")
      .select("id, project_id, bill_date, due_date, amount, description, status"),
    supabase
      .from("projects")
      .select("id, name, status, budget, contract_amount, client, client_name, customer_id"),
    supabase.from("customers").select("id, name, company_name"),
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
  const legacyBills = safeRows(legacyBillsRes as QueryResponse<LegacyBillRow>, "bills", warnings);
  const subcontractBills = safeRows(
    subcontractBillsRes as QueryResponse<SubcontractBillRow>,
    "subcontract_bills",
    warnings
  );
  const projects = safeRows(projectsRes as QueryResponse<ProjectRow>, "projects", warnings);
  const customers = safeRows(customersRes as QueryResponse<CustomerRow>, "customers", warnings);

  return {
    range,
    monthly: buildMonthlyKpis({
      range,
      invoices,
      payments,
      expenses,
      laborEntries,
      apBills,
      legacyBills,
      subcontractBills,
    }),
    projectProfitability: {
      rows: buildProjectProfitability({
        invoices,
        payments,
        expenses,
        laborEntries,
        apBills,
        legacyBills,
        subcontractBills,
        projects,
        customers,
      }),
    },
    arAging: buildArAging({ invoices, payments, projects }),
    apAging: buildApAging({
      apBills,
      legacyBills,
      subcontractBills,
      laborEntries,
      workerPayments,
      projects,
    }),
    warnings,
    sources: [
      "invoices",
      "invoice_payments",
      "expenses",
      "ap_bills",
      "bills",
      "subcontract_bills",
      "labor_entries",
      "worker_payments",
      "projects",
      "customers",
    ],
  };
}
