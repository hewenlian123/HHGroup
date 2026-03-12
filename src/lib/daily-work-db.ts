/**
 * Construction daily labor: daily_work_entries.
 * Day type: full_day, half_day, absent. Pay = day pay + OT.
 */

import { supabase } from "@/lib/supabase";

export type DayType = "full_day" | "half_day" | "absent";

export type DailyWorkEntry = {
  id: string;
  workDate: string;
  workerId: string;
  projectId: string | null;
  dayType: DayType;
  dailyRate: number;
  otAmount: number;
  notes: string | null;
  createdAt: string;
};

export type DailyWorkEntryDraft = {
  workerId: string;
  projectId: string | null;
  dayType: DayType;
  dailyRate: number;
  otAmount: number;
  notes?: string | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS = "id, work_date, worker_id, project_id, day_type, daily_rate, ot_hours, total_pay, notes, created_at";

const TABLE_MISSING_MESSAGE =
  "未找到 daily_work_entries 表。请运行 Supabase 迁移（如 supabase db push），然后在 Project Settings → API 中重新加载 schema 缓存。";

function isTableMissingError(error: { message?: string; code?: string }): boolean {
  const msg = error?.message ?? "";
  return msg.includes("daily_work_entries") && (msg.includes("schema cache") || error?.code === "PGRST205");
}

function fromRow(r: Record<string, unknown>): DailyWorkEntry {
  const dayType = (r.day_type as DayType) || "full_day";
  const dailyRate = Number(r.daily_rate) || 0;
  const totalPay = Number(r.total_pay) ?? 0;
  const dayPay = dayPayForEntry(dayType, dailyRate);
  const otAmount = Math.max(0, totalPay - dayPay);
  return {
    id: r.id as string,
    workDate: (r.work_date as string).slice(0, 10),
    workerId: r.worker_id as string,
    projectId: (r.project_id as string | null) ?? null,
    dayType,
    dailyRate,
    otAmount,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Day pay from day type and daily rate. */
export function dayPayForEntry(dayType: DayType, dailyRate: number): number {
  if (dayType === "absent") return 0;
  if (dayType === "half_day") return dailyRate / 2;
  return dailyRate;
}

/** Total pay for one entry: day pay + OT. */
export function totalPayForEntry(entry: DailyWorkEntry): number {
  const dayPay = dayPayForEntry(entry.dayType, entry.dailyRate);
  return dayPay + entry.otAmount;
}

export async function getDailyWorkEntriesByDate(date: string): Promise<DailyWorkEntry[]> {
  const { data, error } = await client()
    .from("daily_work_entries")
    .select(COLS)
    .eq("work_date", date)
    .order("created_at", { ascending: true });
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load daily work entries.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getDailyWorkEntriesByDateAndProject(
  date: string,
  projectId: string | null
): Promise<DailyWorkEntry[]> {
  let q = client()
    .from("daily_work_entries")
    .select(COLS)
    .eq("work_date", date)
    .order("created_at", { ascending: true });
  if (projectId) q = q.eq("project_id", projectId);
  else q = q.is("project_id", null);
  const { data, error } = await q;
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load daily work entries.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getDailyWorkEntriesInRange(
  fromDate: string,
  toDate: string
): Promise<DailyWorkEntry[]> {
  const { data, error } = await client()
    .from("daily_work_entries")
    .select(COLS)
    .gte("work_date", fromDate)
    .lte("work_date", toDate)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load daily work entries.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

async function getEntryById(id: string): Promise<DailyWorkEntry | null> {
  const { data, error } = await client()
    .from("daily_work_entries")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function insertDailyWorkEntry(
  workDate: string,
  draft: DailyWorkEntryDraft
): Promise<DailyWorkEntry> {
  const dayPay = dayPayForEntry(draft.dayType, draft.dailyRate);
  const totalPay = dayPay + (draft.otAmount ?? 0);
  const { data, error } = await client()
    .from("daily_work_entries")
    .insert({
      work_date: workDate.slice(0, 10),
      worker_id: draft.workerId,
      project_id: draft.projectId,
      day_type: draft.dayType,
      daily_rate: draft.dailyRate,
      ot_hours: 0,
      total_pay: totalPay,
      notes: draft.notes?.trim() || null,
    })
    .select(COLS)
    .single();
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to create entry.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function updateDailyWorkEntry(
  id: string,
  draft: Partial<DailyWorkEntryDraft>
): Promise<DailyWorkEntry> {
  const payload: Record<string, unknown> = {};
  if (draft.workerId != null) payload.worker_id = draft.workerId;
  if (draft.projectId !== undefined) payload.project_id = draft.projectId;
  if (draft.dayType != null) payload.day_type = draft.dayType;
  if (draft.dailyRate != null) payload.daily_rate = draft.dailyRate;
  if (draft.notes !== undefined) payload.notes = draft.notes?.trim() || null;

  const needTotalPay =
    draft.otAmount != null || draft.dayType != null || draft.dailyRate != null;
  if (needTotalPay) {
    const current = await getEntryById(id);
    const dayType = draft.dayType ?? current?.dayType ?? "full_day";
    const dailyRate = draft.dailyRate ?? current?.dailyRate ?? 0;
    const otAmount = draft.otAmount ?? current?.otAmount ?? 0;
    payload.total_pay = dayPayForEntry(dayType, dailyRate) + otAmount;
    payload.ot_hours = 0;
  }

  if (Object.keys(payload).length === 0) {
    const existing = await getEntryById(id);
    if (!existing) throw new Error("Entry not found.");
    return existing;
  }

  const { data, error } = await client()
    .from("daily_work_entries")
    .update(payload)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to update entry.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function deleteDailyWorkEntry(id: string): Promise<void> {
  const { error } = await client().from("daily_work_entries").delete().eq("id", id);
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to delete entry.");
  }
}

/** Payroll summary by worker for date range. */
export type PayrollSummaryRow = {
  workerId: string;
  workerName: string;
  daysWorked: number;
  otTotal: number;
  totalPay: number;
};

export async function getPayrollSummary(fromDate: string, toDate: string): Promise<PayrollSummaryRow[]> {
  const entries = await getDailyWorkEntriesInRange(fromDate, toDate);
  const byWorker = new Map<
    string,
    { workerId: string; workerName: string; daysWorked: number; otTotal: number; totalPay: number }
  >();
  const workerNames = new Map<string, string>();
  for (const e of entries) {
    workerNames.set(e.workerId, e.workerId);
    const existing = byWorker.get(e.workerId);
    const dayPay = dayPayForEntry(e.dayType, e.dailyRate);
    const totalPay = dayPay + e.otAmount;
    const days =
      e.dayType === "full_day" ? 1 : e.dayType === "half_day" ? 0.5 : 0;
    if (existing) {
      existing.daysWorked += days;
      existing.otTotal += e.otAmount;
      existing.totalPay += totalPay;
    } else {
      byWorker.set(e.workerId, {
        workerId: e.workerId,
        workerName: e.workerId,
        daysWorked: days,
        otTotal: e.otAmount,
        totalPay,
      });
    }
  }
  const workers = await getWorkersForPayroll(Array.from(byWorker.keys()));
  for (const w of workers) workerNames.set(w.id, w.name);
  return Array.from(byWorker.values()).map((r) => ({
    ...r,
    workerName: workerNames.get(r.workerId) ?? r.workerId,
  }));
}

async function getWorkersForPayroll(workerIds: string[]): Promise<{ id: string; name: string }[]> {
  if (workerIds.length === 0) return [];
  const { data } = await client()
    .from("workers")
    .select("id, name")
    .in("id", workerIds);
  return ((data ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name }));
}

/** Entries for one worker in date range (for detail view). */
export async function getDailyWorkEntriesForWorker(
  workerId: string,
  fromDate: string,
  toDate: string
): Promise<(DailyWorkEntry & { projectName?: string })[]> {
  const entries = await getDailyWorkEntriesInRange(fromDate, toDate);
  const filtered = entries.filter((e) => e.workerId === workerId);
  const projectIds = Array.from(new Set(filtered.map((e) => e.projectId).filter(Boolean))) as string[];
  const projectNames = await getProjectNames(projectIds);
  return filtered.map((e) => ({
    ...e,
    projectName: e.projectId ? projectNames.get(e.projectId) ?? e.projectId : undefined,
  }));
}

async function getProjectNames(projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map();
  const { data } = await client().from("projects").select("id, name").in("id", projectIds);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
}
