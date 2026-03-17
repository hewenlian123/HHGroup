/**
 * Daily Labor Log — Supabase only. No mock.
 * labor_entries schema: id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount, status, submitted_at, approved_at, locked_at, etc.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type LaborEntryStatus = "Draft" | "Submitted" | "Approved" | "Locked";

const LABOR_ENTRIES_COLS = "id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount" as const;
const LABOR_ENTRIES_COLS_WITH_STATUS =
  "id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount, status, submitted_at, submitted_by, approved_at, approved_by, locked_at, locked_by" as const;
/** Columns when cost_amount column does not exist (older schema). */
const LABOR_ENTRIES_COLS_WITHOUT_COST = "id, worker_id, project_id, work_date, hours, cost_code, notes" as const;

export type DailyLaborEntryRow = {
  id: string;
  worker_id: string;
  project_id: string | null;
  work_date: string;
  hours: number;
  cost_code: string | null;
  notes: string | null;
  cost_amount?: number | null;
  status?: LaborEntryStatus;
  submitted_at?: string | null;
  submitted_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  locked_at?: string | null;
  locked_by?: string | null;
};

export type DailyLaborEntryDraft = {
  worker_id: string;
  project_id: string | null;
  hours: number;
  cost_code: string | null;
  notes: string | null;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

export type LaborEntryWithJoins = {
  id: string;
  worker_id: string;
  project_id: string | null;
  work_date: string;
  hours: number;
  cost_code: string | null;
  notes: string | null;
  cost_amount?: number | null;
  status: LaborEntryStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
  worker_name: string | null;
  project_name: string | null;
};

export type LaborSession = "morning" | "afternoon" | "full_day";

function parseSessionFromNotes(notes: unknown): LaborSession | null {
  const n = typeof notes === "string" ? notes : "";
  const m = /(?:^|\s)session=(morning|afternoon|full_day)(?:\s|$)/i.exec(n);
  if (!m) return null;
  const v = m[1]?.toLowerCase();
  if (v === "morning" || v === "afternoon" || v === "full_day") return v;
  return null;
}

async function assertNoDuplicateSession(params: {
  entryIdToExclude?: string;
  workerId: string;
  workDate: string;
  session: LaborSession;
}): Promise<void> {
  const c = client();
  const date = params.workDate.slice(0, 10);
  const { data: rows, error } = await c
    .from("labor_entries")
    .select("id, notes")
    .eq("worker_id", params.workerId)
    .eq("work_date", date);
  if (error) throw new Error(error.message ?? "Failed to validate duplicates.");
  const list = (rows ?? []) as Array<{ id: string; notes: string | null }>;
  const dup = list.find((r) => {
    if (params.entryIdToExclude && r.id === params.entryIdToExclude) return false;
    const s = parseSessionFromNotes(r.notes);
    return s === params.session;
  });
  if (dup) {
    const label = params.session === "full_day" ? "full day" : params.session;
    throw new Error(`This worker already has a ${label} entry for this date.`);
  }
}

export type LaborEntriesFilters = {
  date_from?: string;
  date_to?: string;
  project_id?: string;
  worker_id?: string;
  status?: LaborEntryStatus;
};

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column.*does not exist|does not exist.*column|undefined column/i.test(m);
}

function isAmbiguousRelationship(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /more than one relationship|ambiguous.*relationship/i.test(m);
}

function isMissingFunction(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /could not find the function|schema cache/i.test(m);
}

/** Normalize status for old records: null or invalid -> Draft. */
function normalizeStatus(s: unknown): LaborEntryStatus {
  if (s === "Draft" || s === "Submitted" || s === "Approved" || s === "Locked") return s;
  return "Draft";
}

/** Fetch labor_entries with joins. Includes status and audit fields when column exists. */
export async function getLaborEntriesWithJoins(filters: LaborEntriesFilters = {}): Promise<LaborEntryWithJoins[]> {
  const c = client();
  const statusFilter = filters.status;
  let q = c
    .from("labor_entries")
    .select(LABOR_ENTRIES_COLS_WITH_STATUS)
    .order("work_date", { ascending: false });
  if (filters.date_from) q = q.gte("work_date", filters.date_from.slice(0, 10));
  if (filters.date_to) q = q.lte("work_date", filters.date_to.slice(0, 10));
  if (filters.worker_id) q = q.eq("worker_id", filters.worker_id);
  if (filters.project_id) q = q.eq("project_id", filters.project_id);
  if (statusFilter) q = q.eq("status", statusFilter);

  let rows: Array<Record<string, unknown>> | null = null;
  let error: { message?: string } | null = null;
  let usedStatusCols = true;
  let hasCostAmount = true;

  const first = await q;
  error = first.error;

  if (error && isAmbiguousRelationship(error)) {
    const baseCols = "id, worker_id, project_id, work_date, hours, cost_code, notes, cost_amount";
    let qSafe = c.from("labor_entries").select(baseCols).order("work_date", { ascending: false });
    if (filters.date_from) qSafe = qSafe.gte("work_date", filters.date_from.slice(0, 10));
    if (filters.date_to) qSafe = qSafe.lte("work_date", filters.date_to.slice(0, 10));
    if (filters.worker_id) qSafe = qSafe.eq("worker_id", filters.worker_id);
    if (filters.project_id) qSafe = qSafe.eq("project_id", filters.project_id);
    const safeRes = await qSafe;
    error = safeRes.error;
    if (!safeRes.error) rows = safeRes.data as Array<Record<string, unknown>>;
    usedStatusCols = false;
  }

  if (error && isMissingColumn(error)) {
    usedStatusCols = false;
    let qFallback = c
      .from("labor_entries")
      .select(LABOR_ENTRIES_COLS)
      .order("work_date", { ascending: false });
    if (filters.date_from) qFallback = qFallback.gte("work_date", filters.date_from.slice(0, 10));
    if (filters.date_to) qFallback = qFallback.lte("work_date", filters.date_to.slice(0, 10));
    if (filters.worker_id) qFallback = qFallback.eq("worker_id", filters.worker_id);
    if (filters.project_id) qFallback = qFallback.eq("project_id", filters.project_id);
    const res = await qFallback;
    if (res.error && isMissingColumn(res.error)) {
      hasCostAmount = false;
      let qNoCost = c
        .from("labor_entries")
        .select(LABOR_ENTRIES_COLS_WITHOUT_COST)
        .order("work_date", { ascending: false });
      if (filters.date_from) qNoCost = qNoCost.gte("work_date", filters.date_from.slice(0, 10));
      if (filters.date_to) qNoCost = qNoCost.lte("work_date", filters.date_to.slice(0, 10));
      if (filters.worker_id) qNoCost = qNoCost.eq("worker_id", filters.worker_id);
      if (filters.project_id) qNoCost = qNoCost.eq("project_id", filters.project_id);
      const resNoCost = await qNoCost;
      rows = resNoCost.data as Array<Record<string, unknown>>;
      error = resNoCost.error;
    } else {
      rows = res.data as Array<Record<string, unknown>>;
      error = res.error;
    }
  } else if (!error) {
    rows = first.data as Array<Record<string, unknown>>;
  }

  if (error) throw new Error(error.message ?? "Failed to load labor entries.");
  const entries = (rows ?? []) as DailyLaborEntryRow[];
  if (entries.length === 0) return [];

  const workerIds = Array.from(new Set(entries.map((r) => r.worker_id).filter(Boolean)));
  const projectIds = Array.from(new Set(entries.map((r) => r.project_id).filter((v): v is string => Boolean(v))));

  const [{ data: workerRows, error: workerError }, { data: projectRows, error: projectError }] = await Promise.all([
    workerIds.length
      ? c.from("labor_workers").select("id, name").in("id", workerIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? c.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (workerError) throw new Error(workerError.message ?? "Failed to load labor workers.");
  if (projectError) throw new Error(projectError.message ?? "Failed to load projects.");

  const workerNameById = new Map(
    ((workerRows ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name ?? null])
  );
  const projectNameById = new Map(
    ((projectRows ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name ?? null])
  );

  return entries
    .map((r): LaborEntryWithJoins | null => {
      const status = usedStatusCols ? normalizeStatus((r as Record<string, unknown>).status) : "Draft";
      if (statusFilter && status !== statusFilter) return null;
      const row = r as Record<string, unknown>;
      return {
        id: (r.id ?? "") as string,
        worker_id: (r.worker_id ?? "") as string,
        project_id: (r.project_id ?? null) as string | null,
        work_date: ((r.work_date ?? "") as string).slice(0, 10),
        hours: Number(r.hours) || 0,
        cost_code: (r.cost_code ?? null) as string | null,
        notes: (r.notes ?? null) as string | null,
        cost_amount: hasCostAmount && row.cost_amount != null ? Number(row.cost_amount) : null,
        status,
        submitted_at: (row.submitted_at ?? null) as string | null,
        submitted_by: (row.submitted_by ?? null) as string | null,
        approved_at: (row.approved_at ?? null) as string | null,
        approved_by: (row.approved_by ?? null) as string | null,
        locked_at: (row.locked_at ?? null) as string | null,
        locked_by: (row.locked_by ?? null) as string | null,
        worker_name: workerNameById.get(r.worker_id as string) ?? null,
        project_name: r.project_id ? projectNameById.get(r.project_id as string) ?? null : null,
      };
    })
    .filter((x): x is LaborEntryWithJoins => x != null);
}

/** List labor_workers for filters/dropdowns. Supabase only. */
export async function getLaborWorkersList(): Promise<{ id: string; name: string }[]> {
  const c = client();
  const { data: rows, error } = await c.from("labor_workers").select("id, name").order("name");
  if (error) throw new Error(error.message ?? "Failed to load labor workers.");
  return (rows ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }));
}

/** Fetch one labor_worker by id. Returns null if not found. */
export async function getLaborWorkerById(id: string): Promise<{ id: string; name: string } | null> {
  const c = client();
  const { data: row, error } = await c
    .from("labor_workers")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load worker.");
  if (!row) return null;
  return { id: (row as { id: string }).id, name: (row as { name: string }).name };
}

export type LaborPaymentRow = {
  id: string;
  payment_date: string;
  amount: number;
  method: string | null;
};

/** Fetch labor_payments for a worker, order by payment_date desc. */
export async function getLaborPaymentsByWorkerId(workerId: string): Promise<LaborPaymentRow[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("labor_payments")
    .select("id, payment_date, amount, method")
    .eq("worker_id", workerId)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load payments.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: (r.id as string) ?? "",
    payment_date: ((r.payment_date as string) ?? "").slice(0, 10),
    amount: Number(r.amount) || 0,
    method: (r.method as string | null) ?? null,
  }));
}

export type LaborPaymentInRangeRow = LaborPaymentRow & { worker_id: string };

/** Fetch labor_payments where payment_date between dateFrom and dateTo (inclusive). */
export async function getLaborPaymentsByDateRange(
  dateFrom: string,
  dateTo: string
): Promise<LaborPaymentInRangeRow[]> {
  const c = client();
  const from = dateFrom.slice(0, 10);
  const to = dateTo.slice(0, 10);
  const { data: rows, error } = await c
    .from("labor_payments")
    .select("id, worker_id, payment_date, amount, method")
    .gte("payment_date", from)
    .lte("payment_date", to)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load payments.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: (r.id as string) ?? "",
    worker_id: (r.worker_id as string) ?? "",
    payment_date: ((r.payment_date as string) ?? "").slice(0, 10),
    amount: Number(r.amount) || 0,
    method: (r.method as string | null) ?? null,
  }));
}

export type WorkerPayableSummary = {
  total_earned: number;
  total_paid: number;
  balance: number;
};

/** Fetch one row from worker_payable_summary view for a worker. Supabase only. */
export async function getWorkerPayableSummary(workerId: string): Promise<WorkerPayableSummary | null> {
  const c = client();
  const { data: row, error } = await c
    .from("worker_payable_summary")
    .select("total_earned, total_paid, balance")
    .eq("worker_id", workerId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load worker payable summary.");
  if (!row) return null;
  return {
    total_earned: Number((row as { total_earned?: number }).total_earned) || 0,
    total_paid: Number((row as { total_paid?: number }).total_paid) || 0,
    balance: Number((row as { balance?: number }).balance) || 0,
  };
}

/** Total labor cost (sum labor_entries.cost_amount for Approved/Locked). For finance overview. */
export async function getTotalLaborCost(): Promise<number> {
  const c = client();
  const { data: rows, error } = await c
    .from("labor_entries")
    .select("cost_amount, status")
    .in("status", ["Approved", "Locked"]);
  if (error) {
    if (/column .* does not exist|schema cache/i.test(error.message ?? "")) {
      const fallback = await c.from("labor_entries").select("cost_amount");
      if (fallback.error) return 0;
      return (fallback.data ?? []).reduce((s, r) => s + Number((r as { cost_amount?: number }).cost_amount ?? 0), 0);
    }
    return 0;
  }
  return (rows ?? []).reduce((s, r) => s + Number((r as { cost_amount?: number }).cost_amount ?? 0), 0);
}

export async function getDailyLaborEntriesByDate(workDate: string): Promise<DailyLaborEntryRow[]> {
  const c = client();
  const date = workDate.slice(0, 10);
  const { data: rows, error } = await c
    .from("labor_entries")
    .select(LABOR_ENTRIES_COLS)
    .eq("work_date", date)
    .order("id");
  if (error) throw new Error(error.message ?? "Failed to load labor entries.");
  return (rows ?? []).map((r) => ({
    id: (r as { id: string }).id,
    worker_id: (r as { worker_id: string }).worker_id,
    project_id: (r as { project_id: string | null }).project_id,
    work_date: ((r as { work_date: string }).work_date ?? "").slice(0, 10),
    hours: Number((r as { hours?: number }).hours) || 0,
    cost_code: (r as { cost_code: string | null }).cost_code,
    notes: (r as { notes: string | null }).notes,
  }));
}

/** Insert multiple rows. Only allowed columns. */
export async function insertDailyLaborEntries(
  workDate: string,
  rows: DailyLaborEntryDraft[]
): Promise<DailyLaborEntryRow[]> {
  const c = client();
  const date = workDate.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (date > today) throw new Error("Work date cannot be in the future");

  const warnings: string[] = [];
  const filtered = rows.filter((r, idx) => {
    const hours = Number(r.hours) || 0;
    if (!(hours > 0)) {
      warnings.push(`row#${idx + 1}: hours <= 0 skipped`);
      return false;
    }
    if (!r.project_id) {
      warnings.push(`row#${idx + 1}: project_id missing skipped`);
      return false;
    }
    return Boolean(r.worker_id);
  });
  if (warnings.length && typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn("[daily-labor] insertDailyLaborEntries skipped rows:", warnings);
  }

  const rowsToInsert = filtered;
  const workerIds2 = Array.from(new Set(rowsToInsert.map((r) => r.worker_id).filter(Boolean)));
  const { data: workerRows2, error: workerError2 } = workerIds2.length
    ? await c.from("workers").select("id, half_day_rate").in("id", workerIds2)
    : { data: [], error: null };
  if (workerError2) throw new Error(workerError2.message ?? "Failed to load worker rates.");
  const hourlyRateByWorkerId2 = new Map(
    ((workerRows2 ?? []) as Array<{ id: string; half_day_rate?: number | null }>).map((row) => [row.id, (Number(row.half_day_rate) || 0) / 4])
  );

  const payloads = rowsToInsert.map((r) => ({
    worker_id: r.worker_id,
    project_id: r.project_id || null,
    work_date: date,
    hours: Number(r.hours) || 0,
    cost_code: r.cost_code?.trim() || null,
    notes: r.notes?.trim() || null,
    cost_amount: (Number(r.hours) || 0) * (hourlyRateByWorkerId2.get(r.worker_id) ?? 0),
    status: "Draft",
  }));
  if (payloads.length === 0) return [];
  const colsForSelect = LABOR_ENTRIES_COLS_WITH_STATUS;
  const { data: inserted, error } = await c.from("labor_entries").insert(payloads).select(colsForSelect);
  if (error) {
    if (isMissingColumn(error)) {
      const payloadsWithoutStatus = payloads.map((p) => {
        const copy = { ...p } as Record<string, unknown>;
        delete copy.status;
        return copy;
      });
      const { data: insertedFallback, error: err2 } = await c.from("labor_entries").insert(payloadsWithoutStatus).select(LABOR_ENTRIES_COLS);
      if (err2) throw new Error(err2.message ?? "Failed to save labor entries.");
      return (insertedFallback ?? []).map((r: Record<string, unknown>) => ({
        id: (r.id as string) ?? "",
        worker_id: (r.worker_id as string) ?? "",
        project_id: (r.project_id as string | null) ?? null,
        work_date: ((r.work_date as string) ?? "").slice(0, 10),
        hours: Number(r.hours) || 0,
        cost_code: (r.cost_code as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
      }));
    }
    throw new Error(error.message ?? "Failed to save labor entries.");
  }
  return (inserted ?? []).map((r: Record<string, unknown>) => ({
    id: (r.id as string) ?? "",
    worker_id: (r.worker_id as string) ?? "",
    project_id: (r.project_id as string | null) ?? null,
    work_date: ((r.work_date as string) ?? "").slice(0, 10),
    hours: Number(r.hours) || 0,
    cost_code: (r.cost_code as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));
}

export type DailyLaborEntryOldForReallocate = {
  project_id: string | null;
  hours: number;
  cost_code: string | null;
  notes: string | null;
};

/** Update one entry. Only allowed columns. Locked entries cannot be updated. */
export async function updateDailyLaborEntry(
  entryId: string,
  _oldValues: DailyLaborEntryOldForReallocate,
  draft: DailyLaborEntryDraft
): Promise<DailyLaborEntryRow> {
  const c = client();
  const { data: currentRow } = await c.from("labor_entries").select("status").eq("id", entryId).maybeSingle();
  const status = (currentRow as { status?: string } | null)?.status;
  if (status === "Locked") throw new Error("Cannot edit a locked labor entry.");

  const { data: workerRow, error: workerError } = await c
    .from("workers")
    .select("id, half_day_rate")
    .eq("id", draft.worker_id)
    .maybeSingle();
  if (workerError) throw new Error(workerError.message ?? "Failed to load worker rate.");
  const hourlyRate = (Number((workerRow as { half_day_rate?: number | null } | null)?.half_day_rate) || 0) / 4;
  const payload = {
    worker_id: draft.worker_id,
    project_id: draft.project_id || null,
    hours: Number(draft.hours) || 0,
    cost_code: draft.cost_code?.trim() || null,
    notes: draft.notes?.trim() || null,
    cost_amount: (Number(draft.hours) || 0) * hourlyRate,
  };
  const { data: updated, error } = await c
    .from("labor_entries")
    .update(payload)
    .eq("id", entryId)
    .select(LABOR_ENTRIES_COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to update labor entry.");
  return {
    id: (updated as { id: string }).id,
    worker_id: (updated as { worker_id: string }).worker_id,
    project_id: (updated as { project_id: string | null }).project_id,
    work_date: ((updated as { work_date: string }).work_date ?? "").slice(0, 10),
    hours: Number((updated as { hours?: number }).hours) || 0,
    cost_code: (updated as { cost_code: string | null }).cost_code,
    notes: (updated as { notes: string | null }).notes,
  };
}

/** Delete one entry. */
export async function deleteDailyLaborEntry(entryId: string): Promise<void> {
  const c = client();
  const { error: delError } = await c.from("labor_entries").delete().eq("id", entryId);
  if (delError) throw new Error(delError.message ?? "Failed to delete labor entry.");
}

export async function updateLaborEntry(
  entryId: string,
  updates: {
    project_id?: string | null;
    session?: LaborSession;
    amount?: number;
    overtime_hours?: number;
  }
): Promise<void> {
  const c = client();
  const { data: current, error: curErr } = await c
    .from("labor_entries")
    .select("id, worker_id, work_date, notes, status")
    .eq("id", entryId)
    .maybeSingle();
  if (curErr) throw new Error(curErr.message ?? "Failed to load labor entry.");
  if (!current) throw new Error("Labor entry not found.");
  const status = (current as { status?: string } | null)?.status;
  if (status === "Locked") throw new Error("Cannot edit a locked labor entry.");

  const workerId = (current as { worker_id: string }).worker_id;
  const workDate = (current as { work_date: string }).work_date;
  const existingNotes = ((current as { notes?: string | null }).notes ?? "") as string;

  const session = updates.session ?? parseSessionFromNotes(existingNotes);
  if (session) {
    await assertNoDuplicateSession({
      entryIdToExclude: entryId,
      workerId,
      workDate,
      session,
    });
  }

  const payload: Record<string, unknown> = {};
  if (updates.project_id !== undefined) payload.project_id = updates.project_id ?? null;
  if (updates.amount !== undefined) payload.cost_amount = Number(updates.amount) || 0;

  const ot = updates.overtime_hours;
  if (session || ot !== undefined) {
    const tokens = existingNotes
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !/^session=(morning|afternoon|full_day)$/i.test(t) && !/^ot_hours=/i.test(t));
    if (session) tokens.push(`session=${session}`);
    if (ot !== undefined && Number.isFinite(Number(ot)) && Number(ot) > 0) tokens.push(`ot_hours=${Number(ot)}`);
    payload.notes = tokens.length ? tokens.join(" ") : null;
  }

  if (Object.keys(payload).length === 0) return;
  const { error } = await c.from("labor_entries").update(payload).eq("id", entryId);
  if (error) throw new Error(error.message ?? "Failed to update labor entry.");
}

export type ProjectLaborBreakdownRow = {
  worker_id: string;
  worker_name: string | null;
  days: number;
  total_ot: number;
  total_labor_cost: number;
};

/** Aggregate labor entries for a project by worker. Supabase RPC only. */
export async function getProjectLaborBreakdown(projectId: string): Promise<ProjectLaborBreakdownRow[]> {
  const c = client();
  const { data: rows, error } = await c.rpc("get_project_labor_breakdown", { p_project_id: projectId });
  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message ?? "Failed to load project labor breakdown.");

    // Fallback for environments missing the RPC: aggregate from labor_entries directly.
    const entries = await getLaborEntriesWithJoins({ project_id: projectId }).catch(() => []);
    const byWorker = new Map<string, { worker_name: string | null; days: Set<string>; total_labor_cost: number }>();
    for (const e of entries) {
      if (e.status !== "Approved" && e.status !== "Locked") continue;
      const key = e.worker_id;
      if (!key) continue;
      const cur = byWorker.get(key) ?? { worker_name: e.worker_name ?? null, days: new Set<string>(), total_labor_cost: 0 };
      cur.worker_name = cur.worker_name ?? e.worker_name ?? null;
      cur.days.add(e.work_date);
      cur.total_labor_cost += Number(e.cost_amount) || 0;
      byWorker.set(key, cur);
    }
    return Array.from(byWorker.entries()).map(([worker_id, v]) => ({
      worker_id,
      worker_name: v.worker_name,
      days: v.days.size,
      total_ot: 0,
      total_labor_cost: v.total_labor_cost,
    }));
  }

  return (rows ?? []).map((r: Record<string, unknown>) => ({
    worker_id: (r.worker_id as string) ?? "",
    worker_name: (r.worker_name as string | null) ?? null,
    days: Number(r.days) || 0,
    total_ot: Number(r.total_ot) || 0,
    total_labor_cost: Number(r.total_labor_cost) || 0,
  }));
}

export type MonthlyPayrollRow = {
  worker_id: string;
  worker_name: string | null;
  gross: number;
  ot: number;
  total: number;
};

/** Monthly payroll summary by worker. Supabase RPC only. */
export async function getMonthlyPayrollSummary(year: number, month: number): Promise<MonthlyPayrollRow[]> {
  const c = client();
  const { data: rows, error } = await c.rpc("get_monthly_payroll_summary", {
    p_year: year,
    p_month: month,
  });
  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message ?? "Failed to load payroll summary.");
    // Fallback: aggregate from labor_entries for the given month.
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const entries = await getLaborEntriesWithJoins({}).catch(() => [] as Awaited<ReturnType<typeof getLaborEntriesWithJoins>>);
    const filtered = entries.filter((e) => e.work_date?.startsWith(monthStr) && (e.status === "Approved" || e.status === "Locked"));
    const byWorker = new Map<string, { worker_name: string | null; total_labor_cost: number }>();
    for (const e of filtered) {
      const key = e.worker_id ?? "";
      if (!key) continue;
      const cur = byWorker.get(key) ?? { worker_name: e.worker_name ?? null, total_labor_cost: 0 };
      cur.total_labor_cost += Number(e.cost_amount) || 0;
      byWorker.set(key, cur);
    }
    return Array.from(byWorker.entries()).map(([worker_id, v]) => ({
      worker_id,
      worker_name: v.worker_name,
      gross: v.total_labor_cost,
      ot: 0,
      total: v.total_labor_cost,
    }));
  }
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    worker_id: (r.worker_id as string) ?? "",
    worker_name: (r.worker_name as string | null) ?? null,
    gross: Number(r.gross) || 0,
    ot: Number(r.ot) || 0,
    total: Number(r.total) || 0,
  }));
}

export type LaborPaymentInsert = {
  worker_id: string;
  payment_date: string;
  amount: number;
  method: string;
  note?: string | null;
};

/** Insert one row into labor_payments. Supabase only. Note is stored as memo. */
export async function insertLaborPayment(payload: LaborPaymentInsert): Promise<void> {
  const c = client();
  const { error } = await c.from("labor_payments").insert({
    worker_id: payload.worker_id,
    payment_date: payload.payment_date.slice(0, 10),
    amount: Number(payload.amount) || 0,
    method: payload.method || null,
    memo: payload.note?.trim() || null,
  });
  if (error) throw new Error(error.message ?? "Failed to record payment.");
}

/** Bulk submit labor entries (Draft -> Submitted). */
export async function submitLaborEntries(entryIds: string[], submittedBy?: string | null): Promise<void> {
  if (entryIds.length === 0) return;
  const c = client();
  const now = new Date().toISOString();
  const { error } = await c
    .from("labor_entries")
    .update({
      status: "Submitted",
      submitted_at: now,
      submitted_by: submittedBy?.trim() || null,
    })
    .in("id", entryIds)
    .eq("status", "Draft");
  if (error) throw new Error(error.message ?? "Failed to submit entries.");
}

/** Bulk approve labor entries (Submitted -> Approved). */
export async function approveLaborEntries(entryIds: string[], approvedBy?: string | null): Promise<void> {
  if (entryIds.length === 0) return;
  const c = client();
  const now = new Date().toISOString();
  const { error } = await c
    .from("labor_entries")
    .update({
      status: "Approved",
      approved_at: now,
      approved_by: approvedBy?.trim() || null,
    })
    .in("id", entryIds)
    .eq("status", "Submitted");
  if (error) throw new Error(error.message ?? "Failed to approve entries.");
}

/** Bulk lock labor entries (Approved -> Locked). */
export async function lockLaborEntries(entryIds: string[], lockedBy?: string | null): Promise<void> {
  if (entryIds.length === 0) return;
  const c = client();
  const now = new Date().toISOString();
  const { error } = await c
    .from("labor_entries")
    .update({
      status: "Locked",
      locked_at: now,
      locked_by: lockedBy?.trim() || null,
    })
    .in("id", entryIds)
    .eq("status", "Approved");
  if (error) throw new Error(error.message ?? "Failed to lock entries.");
}

export type LaborEntryRecentRow = {
  id: string;
  project_id: string | null;
  work_date: string;
  cost_amount: number;
  notes: string | null;
  created_at: string;
  project_name: string | null;
};

/** Recent labor entries for dashboard activity feed. Ordered by created_at desc (fallback work_date), limit. */
export async function getLaborEntriesRecent(limit: number): Promise<LaborEntryRecentRow[]> {
  const c = client();
  const limitNum = Math.max(1, Math.min(limit, 100));
  let rows: Array<Record<string, unknown>> | null = null;
  const selWithCreated = "id, project_id, work_date, cost_amount, notes, created_at, projects!project_id(name)";
  const { data: dataWithCreated, error: errCreated } = await c
    .from("labor_entries")
    .select(selWithCreated)
    .order("created_at", { ascending: false })
    .limit(limitNum);
  if (!errCreated && dataWithCreated?.length) {
    rows = dataWithCreated as Array<Record<string, unknown>>;
  }
  if (!rows?.length && (isMissingColumn(errCreated) || (errCreated?.message ?? "").includes("more than one relationship"))) {
    const { data: dataFallback } = await c
      .from("labor_entries")
      .select("id, project_id, work_date, cost_amount, notes")
      .order("work_date", { ascending: false })
      .limit(limitNum);
    rows = (dataFallback ?? []) as Array<Record<string, unknown>>;
    for (const r of rows) {
      r.created_at = (r as { work_date?: string }).work_date ?? new Date().toISOString();
    }
    if (rows.length > 0) {
      const projectIds = Array.from(new Set(rows.map((r) => (r as { project_id?: string }).project_id).filter(Boolean))) as string[];
      const { data: projRows } = projectIds.length
        ? await c.from("projects").select("id, name").in("id", projectIds)
        : { data: [] };
      const projectNameById = new Map(
        ((projRows ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name ?? null])
      );
      for (const r of rows) {
        const pid = (r as { project_id?: string }).project_id;
        (r as Record<string, unknown>).projects = pid ? { name: projectNameById.get(pid) ?? null } : null;
      }
    }
  } else if (!rows?.length && dataWithCreated !== undefined) {
    rows = (dataWithCreated ?? []) as Array<Record<string, unknown>>;
  }
  if (!rows?.length) return [];
  return rows.map((r) => {
    const proj = (r as { projects?: { name?: string } | null }).projects;
    return {
      id: (r.id as string) ?? "",
      project_id: (r.project_id as string | null) ?? null,
      work_date: ((r.work_date as string) ?? "").slice(0, 10),
      cost_amount: Number(r.cost_amount) || 0,
      notes: (r.notes as string | null) ?? null,
      created_at: (r.created_at as string) ?? new Date().toISOString(),
      project_name: proj?.name ?? null,
    };
  });
}
