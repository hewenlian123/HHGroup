/**
 * Worker monthly report — read-only aggregation.
 *
 * Column lists match production public.* (verified via information_schema):
 * - labor_entries: work_date, cost_amount, worker_id; project_id optional (older local DBs omit it)
 * - worker_invoices: created_at, amount, project_id, worker_id
 * - labor_invoices: invoice_date, amount, status, project_splits, worker_id
 * - worker_reimbursements: reimbursement_date, created_at, amount, project_id, worker_id, payment_id
 * - worker_advances: advance_date, amount, project_id, worker_id, status
 * - worker_payments: total_amount + created_at, or amount + payment_date on older deployments
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyProfile } from "@/lib/company-profile";
import {
  companyProfileToDocumentDto,
  type DocumentCompanyProfileDTO,
} from "@/lib/document-company-profile";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { daysWorkedFromLaborInput } from "@/lib/worker-rate-history-db";

export type WorkerMonthlyReportRowType =
  | "Labor"
  | "Reimbursement"
  | "Invoice"
  | "Advance"
  | "Payment";

export type WorkerMonthlyReportRow = {
  id: string;
  date: string;
  type: WorkerMonthlyReportRowType;
  projectLabel: string;
  amount: number;
  sortKey: string;
};

export type WorkerMonthlyReportSummary = {
  earned: number;
  reimbursements: number;
  totalOwed: number;
  cashPaid: number;
  advanceDeductions: number;
  settled: number;
  paid: number;
  balance: number;
};

/** Extra fields for print / PDF payroll statement (screen UI may ignore). */
export type WorkerMonthlyReportPayrollStatement = {
  companyName: string;
  company: DocumentCompanyProfileDTO;
  monthYm: string;
  monthLabel: string;
  generatedAtDisplay: string;
  /** Count of labor_entries (time entries) in the month */
  totalDays: number;
  /** Snapshot/implied daily rate for this report period; worker profile rate is only a no-labor fallback. */
  dailyRate: number;
  dailyRateFromWorker: boolean;
};

export type WorkerMonthlyReportResult = {
  workerName: string;
  monthLabel: string;
  rows: WorkerMonthlyReportRow[];
  summary: WorkerMonthlyReportSummary;
  payrollStatement: WorkerMonthlyReportPayrollStatement;
  supabaseConfigured: boolean;
  loadError: string | null;
};

const YM_RE = /^(\d{4})-(\d{2})$/;

export function parseMonthYm(input: string | undefined | null): string {
  if (input && YM_RE.test(input.trim())) return input.trim();
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthRangeUtc(ym: string): {
  start: string;
  nextStart: string;
  tStart: string;
  tNext: string;
} {
  const m = ym.match(YM_RE);
  if (!m) throw new Error("Invalid month");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error("Invalid month");
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const nextStart = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return {
    start,
    nextStart,
    tStart: `${start}T00:00:00.000Z`,
    tNext: `${nextStart}T00:00:00.000Z`,
  };
}

function monthHeading(ym: string): string {
  const m = ym.match(YM_RE);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function generatedAtLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function stubPayrollStatement(monthYm: string): WorkerMonthlyReportPayrollStatement {
  const company = companyProfileToDocumentDto(null);
  return {
    companyName: company.companyName,
    company,
    monthYm,
    monthLabel: monthHeading(monthYm),
    generatedAtDisplay: generatedAtLabel(),
    totalDays: 0,
    dailyRate: 0,
    dailyRateFromWorker: false,
  };
}

type WorkerRowRates = {
  id: string;
  name: string | null;
  half_day_rate?: unknown;
  daily_rate?: unknown;
};

async function loadWorkerForReport(
  admin: SupabaseClient,
  wid: string
): Promise<{ data: WorkerRowRates | null; error: { message?: string } | null }> {
  let res = await admin.from("workers").select("*").eq("id", wid).maybeSingle();
  if (res.error && isRetryableSelectError(res.error)) {
    res = await admin.from("workers").select("id, name, half_day_rate").eq("id", wid).maybeSingle();
  }
  if (res.error && isRetryableSelectError(res.error)) {
    res = await admin.from("workers").select("id, name").eq("id", wid).maybeSingle();
  }
  return { data: res.data as WorkerRowRates | null, error: res.error };
}

type Split = { projectId?: string; project_id?: string };

function laborInvoiceProjectLabel(splits: unknown, nameByProject: Map<string, string>): string {
  const arr = Array.isArray(splits) ? splits : [];
  const ids = arr
    .map((s) => (s as Split).projectId ?? (s as Split).project_id ?? "")
    .filter(Boolean);
  if (ids.length === 0) return "—";
  if (ids.length === 1) {
    const n = nameByProject.get(ids[0]);
    return n && n.trim() ? n : "—";
  }
  return "Multiple projects";
}

function isRetryableSelectError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /could not find the .* column|column .* does not exist|schema cache|pgrst204/i.test(m);
}

function emptySummary(): WorkerMonthlyReportSummary {
  return {
    earned: 0,
    reimbursements: 0,
    totalOwed: 0,
    cashPaid: 0,
    advanceDeductions: 0,
    settled: 0,
    paid: 0,
    balance: 0,
  };
}

function money(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n * 100) / 100;
  return Math.abs(rounded) < 0.005 ? 0 : rounded;
}

function firstPositiveMoney(...values: unknown[]): number {
  for (const value of values) {
    const n = money(value);
    if (n > 0.005) return n;
  }
  return money(values.find((value) => Number.isFinite(Number(value))) ?? 0);
}

function dateInMonth(
  value: string | null | undefined,
  range: { start: string; nextStart: string }
): boolean {
  const d = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= range.start && d < range.nextStart;
}

type PaymentRowNormalized = {
  id: string;
  project_id: string | null;
  amount: number;
  payment_date: string;
};

/** Production/local schemas vary; prefer canonical total_amount, then amount. */
async function loadWorkerPaymentsForMonth(
  admin: SupabaseClient,
  wid: string,
  range: { start: string; nextStart: string; tStart: string; tNext: string }
): Promise<{ rows: PaymentRowNormalized[]; error: string | null }> {
  const selectVariants = [
    "id, project_id, total_amount, amount, payment_date, created_at",
    "id, total_amount, amount, payment_date, created_at",
    "id, project_id, total_amount, created_at",
    "id, total_amount, created_at",
    "id, project_id, amount, payment_date, created_at",
    "id, amount, payment_date, created_at",
    "id, amount, payment_date",
  ] as const;

  let lastError: { message?: string } | null = null;
  for (const cols of selectVariants) {
    const res = await admin.from("worker_payments").select(cols).eq("worker_id", wid);
    if (!res.error) {
      const rows = ((res.data ?? []) as unknown as Record<string, unknown>[])
        .map((r) => {
          const paymentDate =
            String(r.payment_date ?? "").slice(0, 10) || String(r.created_at ?? "").slice(0, 10);
          return {
            id: String(r.id ?? ""),
            project_id: r.project_id != null ? String(r.project_id) : null,
            amount: firstPositiveMoney(r.total_amount, r.amount),
            payment_date: paymentDate,
          };
        })
        .filter((r) => r.id && dateInMonth(r.payment_date, range));
      return { rows, error: null };
    }
    lastError = res.error;
    if (!isRetryableSelectError(res.error)) {
      return { rows: [], error: res.error?.message ?? "Failed to load worker payments." };
    }
  }

  return { rows: [], error: lastError?.message ?? "Failed to load worker payments." };
}

type LaborEntryRowNormalized = {
  id: string;
  project_id: string | null;
  work_date: string;
  hours?: unknown;
  morning?: unknown;
  afternoon?: unknown;
  days_worked?: unknown;
  labor_cost_snapshot?: unknown;
  amount_snapshot?: unknown;
  cost_amount: unknown;
  total?: unknown;
};

async function loadLaborEntriesForMonth(
  admin: SupabaseClient,
  wid: string,
  range: { start: string; nextStart: string }
): Promise<{ rows: LaborEntryRowNormalized[]; error: string | null }> {
  const selectVariants = [
    "id, project_id, work_date, hours, morning, afternoon, days_worked, labor_cost_snapshot, amount_snapshot, cost_amount",
    "id, project_id, work_date, hours, morning, afternoon, days_worked, amount_snapshot, cost_amount",
    "id, project_id, work_date, hours, morning, afternoon, cost_amount",
    "id, work_date, hours, morning, afternoon, days_worked, labor_cost_snapshot, amount_snapshot, cost_amount",
    "id, work_date, hours, morning, afternoon, cost_amount",
    "id, work_date, cost_amount",
    "id, work_date, total",
  ] as const;

  let lastError: { message?: string } | null = null;
  for (const cols of selectVariants) {
    const res = await admin
      .from("labor_entries")
      .select(cols)
      .eq("worker_id", wid)
      .gte("work_date", range.start)
      .lt("work_date", range.nextStart);

    if (!res.error) {
      return {
        rows: ((res.data ?? []) as unknown as LaborEntryRowNormalized[]).map((r) => ({
          ...r,
          project_id: r.project_id != null ? String(r.project_id) : null,
          work_date: String(r.work_date ?? "").slice(0, 10),
          cost_amount: r.cost_amount,
        })),
        error: null,
      };
    }
    lastError = res.error;
    if (!isRetryableSelectError(res.error)) {
      return { rows: [], error: res.error?.message ?? "Failed to load labor entries." };
    }
  }

  return { rows: [], error: lastError?.message ?? "Failed to load labor entries." };
}

function laborEntryAmountForMonthlyReport(row: LaborEntryRowNormalized): number {
  return Math.abs(
    money(row.labor_cost_snapshot ?? row.amount_snapshot ?? row.cost_amount ?? row.total)
  );
}

function laborEntryDaysForMonthlyReport(row: LaborEntryRowNormalized): number {
  const snapDays = Number(row.days_worked);
  if (Number.isFinite(snapDays) && snapDays > 0) return snapDays;
  const inferred = daysWorkedFromLaborInput({
    hours: row.hours,
    morning: row.morning,
    afternoon: row.afternoon,
  });
  return inferred > 0 ? inferred : 1;
}

async function loadProjectNames(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data, error } = await admin.from("projects").select("id, name").in("id", uniq);
  if (error || !data) return map;
  for (const r of data as { id: string; name: string | null }[]) {
    if (r?.id) map.set(String(r.id), String(r.name ?? "").trim());
  }
  return map;
}

export async function getWorkerMonthlyReport(
  workerId: string,
  monthYm: string
): Promise<WorkerMonthlyReportResult> {
  const admin = getServerSupabaseInternalNoStore();
  if (!admin) {
    return {
      workerName: "",
      monthLabel: monthHeading(monthYm),
      rows: [],
      summary: emptySummary(),
      payrollStatement: stubPayrollStatement(monthYm),
      supabaseConfigured: false,
      loadError: "Supabase is not configured.",
    };
  }

  let range: { start: string; nextStart: string; tStart: string; tNext: string };
  try {
    range = monthRangeUtc(monthYm);
  } catch {
    const fallback = parseMonthYm(null);
    range = monthRangeUtc(fallback);
  }

  const wid = workerId.trim();
  if (!wid) {
    return {
      workerName: "",
      monthLabel: monthHeading(monthYm),
      rows: [],
      summary: emptySummary(),
      payrollStatement: stubPayrollStatement(monthYm),
      supabaseConfigured: true,
      loadError: "Missing worker id.",
    };
  }

  const workerRes = await loadWorkerForReport(admin, wid);

  type ReimbReportRow = {
    id: unknown;
    project_id: unknown;
    amount: unknown;
    created_at: unknown;
    reimbursement_date?: unknown;
    payment_id?: unknown;
    paid_at?: unknown;
    status?: unknown;
  };
  const [wiRes, liRes, advRes] = await Promise.all([
    admin
      .from("worker_invoices")
      .select("id, project_id, amount, created_at")
      .eq("worker_id", wid)
      .gte("created_at", range.tStart)
      .lt("created_at", range.tNext),
    admin
      .from("labor_invoices")
      .select("id, invoice_date, amount, status, project_splits")
      .eq("worker_id", wid)
      .gte("invoice_date", range.start)
      .lt("invoice_date", range.nextStart),
    admin
      .from("worker_advances")
      .select("id, project_id, amount, advance_date, status, created_at")
      .eq("worker_id", wid)
      .gte("advance_date", range.start)
      .lt("advance_date", range.nextStart),
  ]);

  const { rows: laborRows, error: laborErr } = await loadLaborEntriesForMonth(admin, wid, range);
  const { rows: payRows, error: payErr } = await loadWorkerPaymentsForMonth(admin, wid, range);
  const paymentIdsInMonth = new Set(payRows.map((r) => r.id).filter(Boolean));

  const reimbSelectVariants = [
    "id, project_id, amount, created_at, reimbursement_date, payment_id, paid_at, status",
    "id, project_id, amount, created_at, reimbursement_date, payment_id, status",
    "id, project_id, amount, created_at, reimbursement_date, status",
    "id, project_id, amount, created_at, reimbursement_date",
    "id, project_id, amount, created_at",
  ] as const;
  let reimbData: ReimbReportRow[] | null = null;
  let reimbErr: { message?: string } | null = null;
  for (const cols of reimbSelectVariants) {
    const res = await admin.from("worker_reimbursements").select(cols).eq("worker_id", wid);
    if (!res.error) {
      reimbData = (res.data ?? []) as unknown as ReimbReportRow[];
      reimbErr = null;
      break;
    }
    reimbErr = res.error;
    if (!isRetryableSelectError(res.error)) break;
  }

  const firstErr =
    workerRes.error?.message ??
    laborErr ??
    reimbErr?.message ??
    wiRes.error?.message ??
    liRes.error?.message ??
    advRes.error?.message ??
    payErr ??
    null;

  const workerName = String(workerRes.data?.name ?? "").trim();

  const reimbRows = (reimbData ?? []) as {
    id: string;
    project_id: string | null;
    amount: unknown;
    created_at: string;
    reimbursement_date?: string | null;
    payment_id?: string | null;
    paid_at?: string | null;
    status?: string | null;
  }[];
  const reimbRowsInReport = reimbRows.filter((r) => {
    const reimbDate =
      typeof r.reimbursement_date === "string" && r.reimbursement_date
        ? r.reimbursement_date
        : String(r.created_at ?? "").slice(0, 10);
    if (dateInMonth(reimbDate, range)) return true;
    if (r.payment_id && paymentIdsInMonth.has(String(r.payment_id))) return true;
    if (dateInMonth(r.paid_at, range)) return true;
    return false;
  });
  const wiRows = (wiRes.data ?? []) as {
    id: string;
    project_id: string | null;
    amount: unknown;
    created_at: string;
  }[];
  const liRows = (liRes.data ?? []) as {
    id: string;
    invoice_date: string;
    amount: unknown;
    status: string | null;
    project_splits: unknown;
  }[];
  const advRows = (advRes.data ?? []) as {
    id: string;
    project_id: string | null;
    amount: unknown;
    advance_date: string;
    status?: string | null;
    created_at?: string | null;
  }[];

  const projectIds: string[] = [];
  for (const r of laborRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of reimbRowsInReport) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of wiRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of advRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of payRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of liRows) {
    const splits = Array.isArray(r.project_splits) ? r.project_splits : [];
    for (const s of splits) {
      const pid = (s as Split).projectId ?? (s as Split).project_id;
      if (pid) projectIds.push(String(pid));
    }
  }

  const nameByProject = await loadProjectNames(admin, projectIds);

  const merged: WorkerMonthlyReportRow[] = [];

  for (const r of laborRows) {
    const amt = laborEntryAmountForMonthlyReport(r);
    const d = String(r.work_date ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `labor-${r.id}`,
      date: d,
      type: "Labor",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:00|0|${r.id}`,
    });
  }

  for (const r of reimbRowsInReport) {
    const amt = Math.abs(money(r.amount));
    const rd = r.reimbursement_date;
    const d =
      typeof rd === "string" && /^\d{4}-\d{2}-\d{2}/.test(rd)
        ? rd.slice(0, 10)
        : String(r.created_at ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `reimb-${r.id}`,
      date: d,
      type: "Reimbursement",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:01|1|${r.id}`,
    });
  }

  for (const r of wiRows) {
    const amt = Math.abs(money(r.amount));
    const d = String(r.created_at ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `winv-${r.id}`,
      date: d,
      type: "Invoice",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:02|2|${r.id}`,
    });
  }

  for (const r of liRows) {
    const st = String(r.status ?? "").toLowerCase();
    if (st === "void") continue;
    const amt = Math.abs(money(r.amount));
    const d = String(r.invoice_date ?? "").slice(0, 10);
    merged.push({
      id: `linv-${r.id}`,
      date: d,
      type: "Invoice",
      projectLabel: laborInvoiceProjectLabel(r.project_splits, nameByProject),
      amount: amt,
      sortKey: `${d}T00:00:03|3|${r.id}`,
    });
  }

  for (const r of advRows) {
    if (String(r.status ?? "").toLowerCase() === "cancelled") continue;
    const raw = money(r.amount);
    const amt = -Math.abs(raw);
    const d = String(r.advance_date ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `adv-${r.id}`,
      date: d,
      type: "Advance",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:04|4|${r.id}`,
    });
  }

  for (const r of payRows) {
    const raw = money(r.amount);
    const amt = -Math.abs(raw);
    const d = String(r.payment_date ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `pay-${r.id}`,
      date: d,
      type: "Payment",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:05|5|${r.id}`,
    });
  }

  merged.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  let laborSum = 0;
  for (const r of laborRows) laborSum += laborEntryAmountForMonthlyReport(r);

  let wiSum = 0;
  for (const r of wiRows) wiSum += Math.abs(money(r.amount));

  let liSum = 0;
  for (const r of liRows) {
    if (String(r.status ?? "").toLowerCase() === "void") continue;
    liSum += Math.abs(money(r.amount));
  }

  const earned = laborSum + wiSum + liSum;

  let reimbSum = 0;
  for (const r of reimbRowsInReport) reimbSum += Math.abs(money(r.amount));

  const totalOwed = earned + reimbSum;

  let cashPaid = 0;
  for (const r of payRows) cashPaid += Math.abs(money(r.amount));

  let advanceDeductions = 0;
  for (const r of advRows) {
    if (String(r.status ?? "").toLowerCase() === "cancelled") continue;
    advanceDeductions += Math.abs(money(r.amount));
  }

  const settled = cashPaid + advanceDeductions;
  const paid = settled;
  const balance = totalOwed - paid;

  const totalDays = laborRows.reduce((sum, r) => sum + laborEntryDaysForMonthlyReport(r), 0);
  const halfDay = Number(workerRes.data?.half_day_rate) || 0;
  const dailyExplicitRaw = workerRes.data?.daily_rate;
  const dailyExplicit =
    dailyExplicitRaw != null && Number(dailyExplicitRaw) > 0 ? Number(dailyExplicitRaw) : 0;
  const dailyFromHalfPairs = halfDay > 0 ? 2 * halfDay : 0;
  const workerDailyRate =
    dailyExplicit > 0 ? dailyExplicit : dailyFromHalfPairs > 0 ? dailyFromHalfPairs : null;
  const impliedDaily = totalDays > 0 && laborSum > 0 ? laborSum / totalDays : 0;
  const dailyRateFromWorker = impliedDaily <= 0 && workerDailyRate != null && workerDailyRate > 0;
  const displayDailyRate =
    impliedDaily > 0 ? impliedDaily : dailyRateFromWorker ? workerDailyRate! : 0;

  let company = companyProfileToDocumentDto(null);
  try {
    const prof = await getCompanyProfile(admin);
    company = companyProfileToDocumentDto(prof);
  } catch {
    /* keep default */
  }

  return {
    workerName,
    monthLabel: monthHeading(monthYm),
    rows: merged,
    summary: {
      earned,
      reimbursements: reimbSum,
      totalOwed,
      cashPaid,
      advanceDeductions,
      settled,
      paid,
      balance,
    },
    payrollStatement: {
      companyName: company.companyName,
      company,
      monthYm,
      monthLabel: monthHeading(monthYm),
      generatedAtDisplay: generatedAtLabel(),
      totalDays,
      dailyRate: displayDailyRate,
      dailyRateFromWorker,
    },
    supabaseConfigured: true,
    loadError: firstErr,
  };
}
