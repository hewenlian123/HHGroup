/**
 * Labor: workers, labor_entries, labor_invoices, labor_payments — Supabase only. No mock data.
 * Tables: workers, labor_entries, labor_invoices, labor_payments.
 *
 * labor_entries schema: id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount.
 */

import { getSupabaseClient } from "@/lib/supabase";

const LABOR_ENTRIES_COLS = "id, worker_id, project_id, work_date, hours, cost_code, notes" as const;
/** Columns for labor cost aggregation (includes cost_amount). Use after migration 202603101200. */
const LABOR_ENTRIES_COLS_WITH_COST = "id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount" as const;
/** Columns for daily (AM/PM) insert; includes morning, afternoon when migration 202603191000 applied. */
const LABOR_ENTRIES_DAILY_COLS = "id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount, morning, afternoon" as const;
/** Columns for reading entries with AM/PM for pay display. */
const LABOR_ENTRIES_COLS_WITH_AMPM = "id, worker_id, project_id, work_date, hours, cost_code, notes, morning, afternoon" as const;
const LABOR_ENTRIES_ALLOWED = new Set<string>(["id", "worker_id", "project_id", "work_date", "hours", "cost_code", "notes", "cost_amount", "morning", "afternoon"]);

function assertLaborEntriesColumns(cols: string[]): void {
  for (const c of cols) {
    if (!LABOR_ENTRIES_ALLOWED.has(c)) {
      throw new Error(`labor_entries: column '${c}' does not exist. Allowed: id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount.`);
    }
  }
}

export type Worker = {
  id: string;
  name: string;
  phone?: string;
  trade?: string;
  status: "active" | "inactive";
  halfDayRate: number;
  /** Full-day rate for pay calculation (AM+PM = dailyRate). From workers.daily_rate or 2*half_day_rate. */
  dailyRate: number;
  notes?: string;
  createdAt: string;
};

export type LaborWorker = Worker;

export type LaborEntry = {
  id: string;
  date: string;
  workerId: string;
  projectId: string;
  hours: number;
  costCode: string;
  notes: string;
  /** When set, pay = (morning ? dailyRate/2 : 0) + (afternoon ? dailyRate/2 : 0). */
  morning?: boolean;
  afternoon?: boolean;
};

export type LaborShiftEntry = LaborEntry;

/** Calculate pay for display: AM = dailyRate/2, PM = dailyRate/2, AM+PM = dailyRate. Hours-only entries: hours * (dailyRate/8). */
export function calculateLaborPay(worker: Worker, entry: LaborEntry): number {
  const dailyRate = worker.dailyRate ?? (worker.halfDayRate ?? 0) * 2;
  const hasAmPm = entry.morning === true || entry.morning === false || entry.afternoon === true || entry.afternoon === false;
  if (hasAmPm) {
    return (entry.morning ? dailyRate / 2 : 0) + (entry.afternoon ? dailyRate / 2 : 0);
  }
  const hours = Number(entry.hours) || 0;
  if (hours <= 0) return 0;
  return hours * (dailyRate / 8);
}

export type LaborInvoiceSplit = { projectId: string; amount: number };
export type LaborInvoiceChecklist = {
  verifiedWorker: boolean;
  verifiedAmount: boolean;
  verifiedAllocation: boolean;
  verifiedAttachment: boolean;
};
export type Attachment = { id: string; fileName: string; mimeType: string; url: string; size: number; createdAt: string };

export type LaborInvoice = {
  id: string;
  invoiceNo: string;
  workerId: string;
  invoiceDate: string;
  amount: number;
  memo?: string;
  projectSplits: LaborInvoiceSplit[];
  status: "draft" | "reviewed" | "confirmed" | "void";
  checklist: LaborInvoiceChecklist;
  attachments: Attachment[];
  createdAt: string;
  confirmedAt?: string;
};

export type LaborPayment = {
  id: string;
  workerId: string;
  paymentDate: string;
  amount: number;
  method: string;
  memo?: string;
  attachments: Attachment[];
  appliedRange?: { startDate: string; endDate: string };
  createdAt: string;
};

type WorkerRow = { id: string; name: string; role: string | null; phone: string | null; half_day_rate: number; status: string; notes: string | null; created_at: string; daily_rate?: number | null };
type LaborEntryRow = {
  id: string;
  worker_id: string;
  project_id: string;
  work_date: string;
  hours: number;
  cost_code: string | null;
  notes: string | null;
  morning?: boolean | null;
  afternoon?: boolean | null;
};
type LaborInvoiceRow = {
  id: string; invoice_no: string; worker_id: string; invoice_date: string; amount: number; memo: string | null; status: string;
  project_splits: LaborInvoiceSplit[]; checklist: Record<string, boolean>; created_at: string; confirmed_at: string | null;
};
type LaborPaymentRow = { id: string; worker_id: string; payment_date: string; amount: number; method: string | null; memo: string | null; applied_start_date: string | null; applied_end_date: string | null; created_at: string };

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column.*does not exist|does not exist.*column|undefined column|could not find.*daily_rate|daily_rate.*schema cache/i.test(m);
}

function toWorker(r: WorkerRow): Worker {
  const halfDay = Number(r.half_day_rate) || 0;
  const dailyRate = r.daily_rate != null && Number(r.daily_rate) > 0 ? Number(r.daily_rate) : halfDay * 2;
  return {
    id: r.id,
    name: r.name ?? "",
    phone: r.phone ?? undefined,
    trade: r.role ?? undefined,
    status: r.status === "inactive" ? "inactive" : "active",
    halfDayRate: halfDay,
    dailyRate,
    notes: r.notes ?? undefined,
    createdAt: r.created_at?.slice(0, 10) ?? "",
  };
}

function toLaborEntry(r: LaborEntryRow): LaborEntry {
  return {
    id: r.id,
    date: (r.work_date ?? "").slice(0, 10),
    workerId: r.worker_id,
    projectId: r.project_id ?? "",
    hours: Number(r.hours) || 0,
    costCode: r.cost_code ?? "",
    notes: r.notes ?? "",
    morning: r.morning === true || r.morning === false ? r.morning : undefined,
    afternoon: r.afternoon === true || r.afternoon === false ? r.afternoon : undefined,
  };
}

function toLaborInvoice(r: LaborInvoiceRow): LaborInvoice {
  const checklist = (r.checklist ?? {}) as Record<string, boolean>;
  const splits = Array.isArray(r.project_splits) ? r.project_splits : [];
  return {
    id: r.id,
    invoiceNo: r.invoice_no ?? "",
    workerId: r.worker_id,
    invoiceDate: r.invoice_date?.slice(0, 10) ?? "",
    amount: Number(r.amount) || 0,
    memo: r.memo ?? undefined,
    projectSplits: splits.map((s) => ({ projectId: (s as { projectId?: string }).projectId ?? (s as { project_id?: string }).project_id ?? "", amount: Number((s as { amount: number }).amount) || 0 })),
    status: (r.status === "void" || r.status === "confirmed" || r.status === "reviewed" ? r.status : "draft") as LaborInvoice["status"],
    checklist: {
      verifiedWorker: !!checklist.verifiedWorker,
      verifiedAmount: !!checklist.verifiedAmount,
      verifiedAllocation: !!checklist.verifiedAllocation,
      verifiedAttachment: !!checklist.verifiedAttachment,
    },
    attachments: [],
    createdAt: r.created_at?.slice(0, 10) ?? "",
    confirmedAt: r.confirmed_at ?? undefined,
  };
}

function toLaborPayment(r: LaborPaymentRow): LaborPayment {
  return {
    id: r.id,
    workerId: r.worker_id,
    paymentDate: r.payment_date?.slice(0, 10) ?? "",
    amount: Number(r.amount) || 0,
    method: r.method ?? "",
    memo: r.memo ?? undefined,
    attachments: [],
    appliedRange: r.applied_start_date && r.applied_end_date ? { startDate: r.applied_start_date.slice(0, 10), endDate: r.applied_end_date.slice(0, 10) } : undefined,
    createdAt: r.created_at ?? "",
  };
}

export async function getWorkers(): Promise<Worker[]> {
  const c = client();
  const colsWithDaily = "id, name, role, phone, half_day_rate, daily_rate, status, notes, created_at";
  const { data: rows, error } = await c.from("workers").select(colsWithDaily).order("name");
  if (error) {
    if (isMissingTable(error)) throw new Error("labor_workers (workers): table not found. Run migrations.");
    if (isMissingColumn(error)) {
      const { data: rows2, error: err2 } = await c.from("workers").select("id, name, role, phone, half_day_rate, status, notes, created_at").order("name");
      if (err2) throw new Error(err2.message ?? "Failed to load workers.");
      return (rows2 ?? []).map((r) => toWorker(r as WorkerRow));
    }
    throw new Error(error.message ?? "Failed to load workers.");
  }
  return (rows ?? []).map((r) => toWorker(r as WorkerRow));
}

export async function getLaborWorkers(): Promise<Worker[]> {
  const all = await getWorkers();
  return all.filter((w) => w.status === "active");
}

export async function getWorkerById(id: string): Promise<Worker | null> {
  const c = client();
  const colsWithDaily = "id, name, role, phone, half_day_rate, daily_rate, status, notes, created_at";
  const { data: row, error } = await c.from("workers").select(colsWithDaily).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingColumn(error)) {
      const { data: row2, error: err2 } = await c.from("workers").select("id, name, role, phone, half_day_rate, status, notes, created_at").eq("id", id).maybeSingle();
      if (err2 || !row2) return null;
      return toWorker(row2 as WorkerRow);
    }
    return null;
  }
  if (!row) return null;
  return toWorker(row as WorkerRow);
}

export async function createWorker(input: {
  name: string;
  phone?: string;
  trade?: string;
  status?: "active" | "inactive";
  halfDayRate?: number;
  dailyRate?: number;
  notes?: string;
}): Promise<Worker> {
  const c = client();
  const dailyRate = input.dailyRate != null ? Number(input.dailyRate) : undefined;
  const halfDayRate = input.halfDayRate != null ? Number(input.halfDayRate) : dailyRate != null ? dailyRate / 2 : 0;
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    phone: input.phone?.trim() ?? null,
    role: input.trade?.trim() ?? null,
    status: input.status ?? "active",
    half_day_rate: Math.max(0, halfDayRate),
    notes: input.notes?.trim() ?? null,
  };
  if (dailyRate != null && Number(dailyRate) >= 0) payload.daily_rate = dailyRate;
  const { data: row, error } = await c
    .from("workers")
    .insert(payload)
    .select("id, name, role, phone, half_day_rate, daily_rate, status, notes, created_at")
    .single();
  if (error) {
    if (isMissingColumn(error)) {
      const { data: row2, error: err2 } = await c
        .from("workers")
        .insert({
          name: input.name.trim(),
          phone: input.phone?.trim() ?? null,
          role: input.trade?.trim() ?? null,
          status: input.status ?? "active",
          half_day_rate: Math.max(0, halfDayRate),
          notes: input.notes?.trim() ?? null,
        })
        .select("id, name, role, phone, half_day_rate, status, notes, created_at")
        .single();
      if (err2 || !row2) throw new Error(err2?.message ?? "Failed to create worker.");
      return toWorker(row2 as WorkerRow);
    }
    throw new Error(error.message ?? "Failed to create worker.");
  }
  return toWorker((row ?? {}) as WorkerRow);
}

export async function updateWorker(
  id: string,
  patch: Partial<{ name: string; phone?: string; trade?: string; status: "active" | "inactive"; halfDayRate: number; notes?: string }>
): Promise<Worker | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.name != null) updates.name = patch.name.trim();
  if (patch.phone !== undefined) updates.phone = patch.phone?.trim() ?? null;
  if (patch.trade !== undefined) updates.role = patch.trade?.trim() ?? null;
  if (patch.status != null) updates.status = patch.status;
  if (patch.halfDayRate != null) updates.half_day_rate = Math.max(0, patch.halfDayRate);
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() ?? null;
  if (Object.keys(updates).length === 0) return getWorkerById(id);
  const { data: row, error } = await c.from("workers").update(updates).eq("id", id).select("id, name, role, phone, half_day_rate, status, notes, created_at").single();
  if (error || !row) return null;
  return toWorker(row as WorkerRow);
}

export async function deleteWorker(id: string): Promise<void> {
  const c = client();
  await c.from("workers").delete().eq("id", id);
}

export async function getLaborAllocatedByProject(projectId: string, date?: string): Promise<number> {
  const c = client();
  let q = c
    .from("labor_entries")
    .select(LABOR_ENTRIES_COLS_WITH_COST)
    .eq("project_id", projectId)
    .in("status", ["Approved", "Locked"]);
  if (date) q = q.eq("work_date", date.slice(0, 10)) as typeof q;
  const { data: rows, error } = await q;
  if (error) {
    if (isMissingTable(error)) throw new Error("labor_entries: table not found. Run migrations.");
    if (isMissingColumn(error)) {
      return 0;
    }
    throw new Error(error.message ?? "Failed to load labor_entries.");
  }
  const entries = (rows ?? []) as Array<LaborEntryRow & { cost_amount?: number | null }>;
  return entries.reduce((total, r) => total + (Number(r.cost_amount) || 0), 0);
}

/** Sum of labor cost (Approved/Locked only) for work_date in [startDate, endDate] (inclusive). For dashboard "Labor Cost This Week". */
export async function getLaborCostForDateRange(startDate: string, endDate: string): Promise<number> {
  const c = client();
  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  const { data: rows, error } = await c
    .from("labor_entries")
    .select("cost_amount")
    .in("status", ["Approved", "Locked"])
    .gte("work_date", start)
    .lte("work_date", end);
  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return 0;
    throw new Error(error.message ?? "Failed to load labor cost.");
  }
  return (rows ?? []).reduce((sum, r) => sum + (Number((r as { cost_amount?: number }).cost_amount) || 0), 0);
}

export async function getLaborEntries(_status?: "draft" | "confirmed"): Promise<LaborEntry[]> {
  void _status; // labor_entries has no status column; param kept for API compatibility
  const c = client();
  const { data: rows, error } = await c
    .from("labor_entries")
    .select(LABOR_ENTRIES_COLS)
    .order("work_date", { ascending: false })
    .order("id");
  if (error) {
    if (isMissingTable(error)) throw new Error("labor_entries: table not found. Run migrations.");
    throw new Error(error.message ?? "Failed to load labor_entries.");
  }
  return (rows ?? []).map((r) => toLaborEntry(r as LaborEntryRow));
}

export async function getLaborEntriesByDate(date: string): Promise<LaborEntry[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("labor_entries")
    .select(LABOR_ENTRIES_COLS_WITH_AMPM)
    .eq("work_date", date.slice(0, 10))
    .order("id");
  if (error && isMissingColumn(error)) {
    const { data: rowsFallback } = await c
      .from("labor_entries")
      .select(LABOR_ENTRIES_COLS)
      .eq("work_date", date.slice(0, 10))
      .order("id");
    return (rowsFallback ?? []).map((r) => toLaborEntry(r as LaborEntryRow));
  }
  return (rows ?? []).map((r) => toLaborEntry(r as LaborEntryRow));
}

/** Entries for a given project and date. Used to disable workers who already have an entry in the Add Daily modal. */
export async function getLaborEntriesByProjectAndDate(projectId: string, workDate: string): Promise<LaborEntry[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("labor_entries")
    .select(LABOR_ENTRIES_COLS_WITH_AMPM)
    .eq("project_id", projectId)
    .eq("work_date", workDate.slice(0, 10))
    .order("id");
  if (error && isMissingColumn(error)) {
    const { data: rowsFallback } = await c
      .from("labor_entries")
      .select(LABOR_ENTRIES_COLS)
      .eq("project_id", projectId)
      .eq("work_date", workDate.slice(0, 10))
      .order("id");
    return (rowsFallback ?? []).map((r) => toLaborEntry(r as LaborEntryRow));
  }
  return (rows ?? []).map((r) => toLaborEntry(r as LaborEntryRow));
}

export type DailyLaborRowInput = {
  workerId: string;
  morning: boolean;
  afternoon: boolean;
  /** Optional OT hours. Pay = base (AM/PM) + otHours * (dailyRate/8)*1.5 */
  otHours?: number;
};

/** Overtime rate multiplier (1.5x typical). */
const OT_MULTIPLIER = 1.5;

/** Insert one labor_entries row per worker with morning and/or afternoon set. AM = 0.5h, PM = 0.5h, both = 1h. Total pay = base + OT. */
export async function insertDailyLaborEntries(
  projectId: string,
  workDate: string,
  rows: DailyLaborRowInput[],
  options?: { notes?: string; costCode?: string }
): Promise<LaborEntry[]> {
  const c = client();
  const date = workDate.slice(0, 10);
  const toInsert = rows.filter((r) => r.morning || r.afternoon);
  if (toInsert.length === 0) return [];

  const workerIds = Array.from(new Set(toInsert.map((r) => r.workerId)));
  const workers = await Promise.all(workerIds.map((id) => getWorkerById(id)));
  const workerMap = new Map(workers.filter((w): w is Worker => w != null).map((w) => [w.id, w]));

  const payloads: Array<Record<string, unknown>> = [];
  for (const r of toInsert) {
    const worker = workerMap.get(r.workerId);
    if (!worker) continue;
    const hours = (r.morning ? 0.5 : 0) + (r.afternoon ? 0.5 : 0);
    if (hours <= 0) continue;
    const dailyRate = worker.dailyRate ?? (worker.halfDayRate ?? 0) * 2;
    const basePay = (r.morning ? dailyRate / 2 : 0) + (r.afternoon ? dailyRate / 2 : 0);
    const otHours = Math.max(0, Number(r.otHours) || 0);
    const otRate = (dailyRate / 8) * OT_MULTIPLIER;
    const otPay = otHours * otRate;
    const totalPay = basePay + otPay;
    payloads.push({
      worker_id: r.workerId,
      project_id: projectId || null,
      work_date: date,
      morning: !!r.morning,
      afternoon: !!r.afternoon,
      hours,
      cost_code: options?.costCode?.trim() || null,
      notes: options?.notes?.trim() || null,
      cost_amount: totalPay,
    });
  }
  if (payloads.length === 0) return [];

  const colsForSelect = LABOR_ENTRIES_DAILY_COLS;
  const { data: inserted, error } = await c.from("labor_entries").insert(payloads).select(colsForSelect);
  if (error) {
    if (isMissingColumn(error)) {
      const payloadsHoursOnly = payloads.map((p) => {
        const rest = { ...(p as Record<string, unknown>) };
        delete rest.morning;
        delete rest.afternoon;
        return rest;
      });
      const { data: fallback, error: err2 } = await c.from("labor_entries").insert(payloadsHoursOnly).select(LABOR_ENTRIES_COLS);
      if (err2) throw new Error(err2.message ?? "Failed to save daily labor entries.");
      return (fallback ?? []).map((row) => toLaborEntry(row as LaborEntryRow));
    }
    const msg = error.message ?? "";
    if (/foreign key constraint|worker_id_fkey/i.test(msg)) {
      throw new Error(
        "Selected worker(s) not found in the database. Run the migration that syncs labor_workers from workers (202604010000), or run supabase/sync_labor_workers_from_workers.sql in the Supabase SQL Editor."
      );
    }
    throw new Error(error.message ?? "Failed to save daily labor entries.");
  }
  return (inserted ?? []).map((r) => toLaborEntry(r as LaborEntryRow));
}

export async function getLaborEntryById(id: string): Promise<LaborEntry | null> {
  const c = client();
  const { data: row, error } = await c.from("labor_entries").select(LABOR_ENTRIES_COLS_WITH_AMPM).eq("id", id).maybeSingle();
  if (error && isMissingColumn(error)) {
    const { data: rowFallback } = await c.from("labor_entries").select(LABOR_ENTRIES_COLS).eq("id", id).maybeSingle();
    if (!rowFallback) return null;
    return toLaborEntry(rowFallback as LaborEntryRow);
  }
  if (error || !row) return null;
  return toLaborEntry(row as LaborEntryRow);
}

export async function upsertLaborEntry(
  entry: Omit<LaborEntry, "id"> & { id?: string }
): Promise<LaborEntry> {
  const c = client();
  const worker = await getWorkerById(entry.workerId);
  if (!worker) throw new Error(`Worker not found: ${entry.workerId}`);
  const hourlyRate = (worker.halfDayRate ?? 0) / 4;
  const hours = Math.max(0, entry.hours ?? 0);
  const payload = {
    worker_id: entry.workerId,
    project_id: entry.projectId || null,
    work_date: entry.date.slice(0, 10),
    hours,
    cost_code: entry.costCode?.trim() || null,
    notes: entry.notes?.trim() || null,
    cost_amount: hours * hourlyRate,
  };
  assertLaborEntriesColumns(Object.keys(payload) as string[]);
  const existing = entry.id ? await getLaborEntryById(entry.id) : null;
  if (existing && entry.id) {
    await c.from("labor_entries").update(payload).eq("id", entry.id);
    const updated = await getLaborEntryById(entry.id);
    if (!updated) throw new Error("Failed to read back labor entry.");
    return updated;
  }
  const { data: row, error } = await c.from("labor_entries").insert(payload).select(LABOR_ENTRIES_COLS).single();
  if (error || !row) throw new Error(error?.message ?? "Failed to upsert labor entry.");
  return toLaborEntry(row as LaborEntryRow);
}

export async function deleteLaborEntry(id: string): Promise<void> {
  const c = client();
  await c.from("labor_entries").delete().eq("id", id);
}

/** No-op: labor_entries has no status column. Returns current entry. */
export async function confirmLaborEntry(id: string): Promise<LaborEntry | null> {
  return getLaborEntryById(id);
}

/** No-op: labor_entries has no status column. Returns current entry. */
export async function unconfirmLaborEntry(id: string): Promise<LaborEntry | null> {
  return getLaborEntryById(id);
}

async function nextLaborInvoiceNo(): Promise<string> {
  const c = client();
  const { data: rows } = await c.from("labor_invoices").select("invoice_no").like("invoice_no", "LI-%").order("invoice_no", { ascending: false }).limit(1);
  let maxSeq = 0;
  for (const r of rows ?? []) {
    const match = /^LI-(\d+)$/.exec((r as { invoice_no: string }).invoice_no);
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]));
  }
  return `LI-${String(maxSeq + 1).padStart(4, "0")}`;
}

export async function getLaborInvoices(): Promise<LaborInvoice[]> {
  const c = client();
  const { data: rows, error } = await c.from("labor_invoices").select("*").order("invoice_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new Error("labor_invoices: table not found. Run migrations.");
    throw new Error(error.message ?? "Failed to load labor_invoices.");
  }
  return (rows ?? []).map((r) => toLaborInvoice(r as LaborInvoiceRow));
}

export async function getLaborInvoiceById(id: string): Promise<LaborInvoice | null> {
  const c = client();
  const { data: row, error } = await c.from("labor_invoices").select("*").eq("id", id).maybeSingle();
  if (error || !row) return null;
  return toLaborInvoice(row as LaborInvoiceRow);
}

export async function getLaborInvoicesByWorker(workerId: string): Promise<LaborInvoice[]> {
  const all = await getLaborInvoices();
  return all.filter((i) => i.workerId === workerId);
}

export async function createLaborInvoice(input: { workerId: string; invoiceDate?: string; amount?: number; memo?: string }): Promise<LaborInvoice> {
  const c = client();
  const invoiceNo = await nextLaborInvoiceNo();
  const date = input.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const amount = Math.max(0, input.amount ?? 0);
  const { data: row, error } = await c
    .from("labor_invoices")
    .insert({
      invoice_no: invoiceNo,
      worker_id: input.workerId,
      invoice_date: date,
      amount,
      memo: input.memo?.trim() ?? null,
      status: "draft",
      project_splits: [],
      checklist: { verifiedWorker: false, verifiedAmount: false, verifiedAllocation: false, verifiedAttachment: false },
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create labor invoice.");
  return toLaborInvoice(row as LaborInvoiceRow);
}

export async function updateLaborInvoice(
  id: string,
  patch: Partial<{
    invoiceNo: string;
    workerId: string;
    invoiceDate: string;
    amount: number;
    memo: string;
    projectSplits: LaborInvoiceSplit[];
    checklist: LaborInvoiceChecklist;
    status: LaborInvoice["status"];
  }>
): Promise<LaborInvoice | null> {
  const c = client();
  const current = await getLaborInvoiceById(id);
  if (!current) return null;
  if ((current.status === "confirmed" || current.status === "void") && patch.status != null && patch.status !== current.status) return current;
  const updates: Record<string, unknown> = {};
  if (patch.invoiceNo != null) updates.invoice_no = patch.invoiceNo;
  if (patch.workerId != null) updates.worker_id = patch.workerId;
  if (patch.invoiceDate != null) updates.invoice_date = patch.invoiceDate.slice(0, 10);
  if (patch.amount != null) updates.amount = Math.max(0, patch.amount);
  if (patch.memo !== undefined) updates.memo = patch.memo?.trim() ?? null;
  if (patch.projectSplits != null) updates.project_splits = patch.projectSplits.filter((s) => !!s.projectId).map((s) => ({ projectId: s.projectId, amount: Math.max(0, s.amount) }));
  if (patch.checklist != null) updates.checklist = patch.checklist;
  if (patch.status != null) updates.status = patch.status;
  if (patch.status === "confirmed") updates.confirmed_at = new Date().toISOString();
  if (Object.keys(updates).length > 0) {
    await c.from("labor_invoices").update(updates).eq("id", id);
  }
  return getLaborInvoiceById(id);
}

export async function deleteLaborInvoice(id: string): Promise<void> {
  const inv = await getLaborInvoiceById(id);
  if (inv?.status === "confirmed") return;
  const c = client();
  await c.from("labor_invoices").delete().eq("id", id);
}

export async function confirmLaborInvoice(id: string): Promise<LaborInvoice | null> {
  const inv = await getLaborInvoiceById(id);
  if (!inv || inv.status === "void") return null;
  const ok =
    inv.checklist.verifiedWorker &&
    inv.checklist.verifiedAmount &&
    inv.checklist.verifiedAllocation &&
    inv.checklist.verifiedAttachment &&
    inv.amount > 0 &&
    inv.projectSplits.length > 0 &&
    Math.abs(inv.amount - inv.projectSplits.reduce((s, x) => s + x.amount, 0)) < 0.01;
  if (!ok) return null;
  const c = client();
  await c.from("labor_invoices").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", id);
  return getLaborInvoiceById(id);
}

export async function voidLaborInvoice(id: string): Promise<LaborInvoice | null> {
  const c = client();
  await c.from("labor_invoices").update({ status: "void" }).eq("id", id);
  return getLaborInvoiceById(id);
}

export async function getLaborInvoiceActualByProject(projectId: string): Promise<number> {
  const list = await getLaborInvoices();
  let total = 0;
  for (const inv of list) {
    if (inv.status !== "confirmed") continue;
    for (const s of inv.projectSplits) {
      if (s.projectId === projectId) total += Math.max(0, s.amount);
    }
  }
  return total;
}

export async function getLaborPayments(filters?: { workerId?: string; startDate?: string; endDate?: string }): Promise<LaborPayment[]> {
  const c = client();
  let q = c.from("labor_payments").select("*").order("payment_date", { ascending: false });
  if (filters?.workerId) q = q.eq("worker_id", filters.workerId) as typeof q;
  if (filters?.startDate) q = q.gte("payment_date", filters.startDate.slice(0, 10)) as typeof q;
  if (filters?.endDate) q = q.lte("payment_date", filters.endDate.slice(0, 10)) as typeof q;
  const { data: rows } = await q;
  return (rows ?? []).map((r) => toLaborPayment(r as LaborPaymentRow));
}

export async function getLaborPaymentsByWorker(workerId: string): Promise<LaborPayment[]> {
  return getLaborPayments({ workerId });
}

export async function createLaborPayment(payload: {
  workerId: string;
  paymentDate: string;
  amount: number;
  method: string;
  memo?: string;
  appliedRange?: { startDate: string; endDate: string };
}): Promise<LaborPayment> {
  const c = client();
  const { data: row, error } = await c
    .from("labor_payments")
    .insert({
      worker_id: payload.workerId,
      payment_date: payload.paymentDate.slice(0, 10),
      amount: Math.max(0, payload.amount),
      method: payload.method ?? null,
      memo: payload.memo ?? null,
      applied_start_date: payload.appliedRange?.startDate?.slice(0, 10) ?? null,
      applied_end_date: payload.appliedRange?.endDate?.slice(0, 10) ?? null,
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create labor payment.");
  return toLaborPayment(row as LaborPaymentRow);
}

export async function deleteLaborPayment(id: string): Promise<boolean> {
  const c = client();
  const { error } = await c.from("labor_payments").delete().eq("id", id);
  return !error;
}

export async function getWorkerUsage(id: string, options?: { hasExpenseLabor?: boolean }): Promise<{ used: boolean; reason?: "entries" | "invoices" }> {
  void options; // reserved for future filtering
  const [entries, invoices] = await Promise.all([getLaborEntries(), getLaborInvoices()]);
  const hasEntries = entries.some((e) => e.workerId === id);
  if (hasEntries) return { used: true, reason: "entries" };
  const hasInvoices = invoices.some((inv) => inv.workerId === id);
  if (hasInvoices) return { used: true, reason: "invoices" };
  return { used: false };
}
