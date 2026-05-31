import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { insertDailyLaborEntriesWithClient } from "@/lib/labor-db";
import {
  hasLaborOvertimeAmountInput,
  hasLaborOvertimeHoursInput,
  hasLaborOvertimeInput,
  mergeLaborOvertimeIntoNotes,
  parseLaborOvertimeAmountFromNotes,
  parseLaborOvertimeHoursFromNotes,
  readLaborOvertimeAmountInput,
  readLaborOvertimeHoursInput,
} from "@/lib/labor-overtime-notes";
import {
  buildLaborEntryRateSnapshotWithClient,
  resolveWorkerDailyRateForDateWithClient,
} from "@/lib/worker-rate-history-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

type LaborEntryPayload = {
  id?: unknown;
  action?: unknown;
  ids?: unknown;
  mode?: unknown;
  workerId?: unknown;
  worker_id?: unknown;
  projectId?: unknown;
  project_id?: unknown;
  workDate?: unknown;
  work_date?: unknown;
  hours?: unknown;
  costCode?: unknown;
  cost_code?: unknown;
  notes?: unknown;
  costAmount?: unknown;
  cost_amount?: unknown;
  overtimeHours?: unknown;
  overtime_hours?: unknown;
  otHours?: unknown;
  ot_hours?: unknown;
  overtimeAmount?: unknown;
  overtime_amount?: unknown;
  otAmount?: unknown;
  ot_amount?: unknown;
  session?: unknown;
  rows?: unknown;
  recalculateWithEffectiveRate?: unknown;
};

type DailyLaborInput = {
  workerId?: unknown;
  morning?: unknown;
  afternoon?: unknown;
  otHours?: unknown;
  overtimeHours?: unknown;
  overtime_hours?: unknown;
  ot_hours?: unknown;
  overtimeAmount?: unknown;
  overtime_amount?: unknown;
  otAmount?: unknown;
  ot_amount?: unknown;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeDate(v: unknown): string {
  const text = safeString(v);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("schema cache") || msg.includes("could not find");
}

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function toPayload(input: LaborEntryPayload) {
  const workerId = safeString(input.workerId ?? input.worker_id);
  const projectId = safeString(input.projectId ?? input.project_id);
  const workDate = safeDate(input.workDate ?? input.work_date);
  const hours = safeNumber(input.hours);
  if (!workerId) throw new Error("Worker is required.");
  if (!projectId) throw new Error("Project is required.");
  if (!workDate) throw new Error("Work date is required.");
  if (hours <= 0) throw new Error("Hours must be greater than 0.");
  const notes = hasLaborOvertimeInput(input as Record<string, unknown>)
    ? mergeLaborOvertimeIntoNotes(input.notes, {
        hours: readLaborOvertimeHoursInput(input),
        amount: readLaborOvertimeAmountInput(input),
      })
    : safeString(input.notes) || null;

  return {
    worker_id: workerId,
    project_id: projectId,
    work_date: workDate,
    hours,
    cost_code: safeString(input.costCode ?? input.cost_code) || null,
    notes,
    cost_amount: safeNumber(input.costAmount ?? input.cost_amount),
  };
}

type LaborSession = "morning" | "afternoon" | "full_day";

function toSession(value: unknown): LaborSession | null {
  const session = safeString(value).toLowerCase();
  if (session === "morning" || session === "afternoon" || session === "full_day") {
    return session;
  }
  return null;
}

function toSessionFlags(session: LaborSession): { morning: boolean; afternoon: boolean } {
  if (session === "morning") return { morning: true, afternoon: false };
  if (session === "afternoon") return { morning: false, afternoon: true };
  return { morning: true, afternoon: true };
}

async function ensureNotDuplicateSession(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseInternal>>,
  input: {
    entryId: string;
    workerId: string;
    workDate: string;
    session: LaborSession;
  }
): Promise<void> {
  const flags = toSessionFlags(input.session);
  const { data, error } = await supabase
    .from("labor_entries")
    .select("id")
    .eq("worker_id", input.workerId)
    .eq("work_date", input.workDate.slice(0, 10))
    .eq("morning", flags.morning)
    .eq("afternoon", flags.afternoon)
    .neq("id", input.entryId)
    .limit(1);
  if (error) throw new Error(error.message ?? "Failed to validate duplicate labor entry.");
  if ((data ?? []).length > 0) {
    throw new Error("This worker already has an entry for the selected session on this date.");
  }
}

async function updateSessionEntry(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseInternal>>,
  body: LaborEntryPayload
): Promise<void> {
  const id = safeString(body.id);
  if (!id) throw new Error("Labor entry id is required.");

  const { data: current, error: curErr } = await supabase
    .from("labor_entries")
    .select("id, worker_id, work_date, morning, afternoon, status, daily_rate_snapshot, notes")
    .eq("id", id)
    .maybeSingle();
  if (curErr) throw new Error(curErr.message ?? "Failed to load labor entry.");
  if (!current) throw new Error("Labor entry not found.");

  const row = current as {
    worker_id: string;
    work_date: string;
    morning?: boolean | null;
    afternoon?: boolean | null;
    status?: string | null;
    daily_rate_snapshot?: number | null;
    notes?: string | null;
  };
  if (row.status === "Locked") throw new Error("Cannot edit a locked labor entry.");

  const session =
    toSession(body.session) ??
    (row.morning && row.afternoon ? "full_day" : row.morning ? "morning" : "afternoon");
  await ensureNotDuplicateSession(supabase, {
    entryId: id,
    workerId: row.worker_id,
    workDate: row.work_date,
    session,
  });

  const flags = toSessionFlags(session);
  const hours = safeNumber(body.hours);
  const amount = safeNumber(body.costAmount ?? body.cost_amount);
  const hasOvertime = hasLaborOvertimeInput(body as Record<string, unknown>);
  const otHours = hasLaborOvertimeHoursInput(body as Record<string, unknown>)
    ? readLaborOvertimeHoursInput(body)
    : parseLaborOvertimeHoursFromNotes(row.notes);
  const otAmount = hasLaborOvertimeAmountInput(body as Record<string, unknown>)
    ? readLaborOvertimeAmountInput(body)
    : parseLaborOvertimeAmountFromNotes(row.notes);
  const snapshot = await buildLaborEntryRateSnapshotWithClient(supabase, {
    workerId: row.worker_id,
    workDate: row.work_date,
    hours,
    morning: flags.morning,
    afternoon: flags.afternoon,
    existingDailyRateSnapshot: row.daily_rate_snapshot,
  });
  const notesSource = Object.prototype.hasOwnProperty.call(body, "notes") ? body.notes : row.notes;
  const payload: Record<string, unknown> = {
    project_id: safeString(body.projectId ?? body.project_id) || null,
    hours,
    cost_amount: amount,
    notes: hasOvertime
      ? mergeLaborOvertimeIntoNotes(notesSource, { hours: otHours, amount: otAmount })
      : safeString(notesSource) || null,
    morning: flags.morning,
    afternoon: flags.afternoon,
    days_worked: snapshot.days_worked,
    daily_rate_snapshot: snapshot.daily_rate_snapshot,
    amount_snapshot: amount,
    labor_cost_snapshot: amount,
  };
  if (snapshot.rate_history_id) payload.rate_history_id = snapshot.rate_history_id;

  const { data: updated, error } = await supabase
    .from("labor_entries")
    .update(payload)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to update labor entry.");
  if (!updated) throw new Error("Labor entry not found.");
}

async function updateDailyEntry(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseInternal>>,
  body: LaborEntryPayload
): Promise<void> {
  const id = safeString(body.id);
  if (!id) throw new Error("Labor entry id is required.");

  const { data: current, error: curErr } = await supabase
    .from("labor_entries")
    .select("id, worker_id, work_date, status, daily_rate_snapshot, notes")
    .eq("id", id)
    .maybeSingle();
  if (curErr) throw new Error(curErr.message ?? "Failed to load labor entry.");
  if (!current) throw new Error("Labor entry not found.");
  const row = current as {
    worker_id?: string | null;
    work_date?: string | null;
    status?: string | null;
    daily_rate_snapshot?: number | null;
    notes?: string | null;
  };
  if (row.status === "Locked") {
    throw new Error("Cannot edit a locked labor entry.");
  }

  const workerId = safeString(body.workerId ?? body.worker_id) || safeString(row.worker_id);
  if (!workerId) throw new Error("Worker is required.");
  const workDate = safeDate(body.workDate ?? body.work_date) || safeString(row.work_date);
  const hours = safeNumber(body.hours);
  const workerChanged = workerId !== safeString(row.worker_id);
  const dateChanged = workDate !== safeString(row.work_date).slice(0, 10);
  const hasOvertime = hasLaborOvertimeInput(body as Record<string, unknown>);
  const otHours = hasLaborOvertimeHoursInput(body as Record<string, unknown>)
    ? readLaborOvertimeHoursInput(body)
    : parseLaborOvertimeHoursFromNotes(row.notes);
  const otAmount = hasLaborOvertimeAmountInput(body as Record<string, unknown>)
    ? readLaborOvertimeAmountInput(body)
    : parseLaborOvertimeAmountFromNotes(row.notes);
  const snapshot = await buildLaborEntryRateSnapshotWithClient(supabase, {
    workerId,
    workDate,
    hours,
    existingDailyRateSnapshot:
      workerChanged || dateChanged || body.recalculateWithEffectiveRate === true
        ? undefined
        : row.daily_rate_snapshot,
  });
  const notesSource = Object.prototype.hasOwnProperty.call(body, "notes") ? body.notes : row.notes;
  const payload = {
    worker_id: workerId,
    project_id: safeString(body.projectId ?? body.project_id) || null,
    work_date: workDate,
    hours,
    cost_code: safeString(body.costCode ?? body.cost_code) || null,
    notes: hasOvertime
      ? mergeLaborOvertimeIntoNotes(notesSource, { hours: otHours, amount: otAmount })
      : safeString(notesSource) || null,
    ...snapshot,
  };

  const { data: updated, error } = await supabase
    .from("labor_entries")
    .update(payload)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to update labor entry.");
  if (!updated) throw new Error("Labor entry not found.");
}

async function runBulkAction(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseInternal>>,
  body: LaborEntryPayload
): Promise<void> {
  const action = safeString(body.action).toLowerCase();
  if (!["submit", "approve", "lock"].includes(action)) throw new Error("Invalid labor action.");
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => safeString(id)).filter(Boolean) : [];
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const patch =
    action === "submit"
      ? { status: "Submitted", submitted_at: now, submitted_by: "pin-owner" }
      : action === "approve"
        ? { status: "Approved", approved_at: now, approved_by: "pin-owner" }
        : { status: "Locked", locked_at: now, locked_by: "pin-owner" };
  const expectedStatus =
    action === "submit" ? "Draft" : action === "approve" ? "Submitted" : "Approved";
  const { error } = await supabase
    .from("labor_entries")
    .update(patch)
    .in("id", ids)
    .eq("status", expectedStatus);
  if (error) throw new Error(error.message ?? `Failed to ${action} labor entries.`);
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view")?.trim() ?? "";
  if (view === "joined") {
    try {
      const [entries, workersRes, projectsRes] = await Promise.all([
        getLaborEntriesWithJoins(
          {
            date_from: searchParams.get("dateFrom")?.trim() || undefined,
            date_to: searchParams.get("dateTo")?.trim() || undefined,
            project_id: searchParams.get("projectId")?.trim() || undefined,
            worker_id: searchParams.get("workerId")?.trim() || undefined,
            status:
              (searchParams.get("status")?.trim() as
                | "Draft"
                | "Submitted"
                | "Approved"
                | "Locked"
                | undefined) || undefined,
          },
          supabase
        ),
        supabase.from("labor_workers").select("id,name").order("name").limit(1000),
        supabase.from("projects").select("id,name").order("name").limit(1000),
      ]);
      if (workersRes.error && !isMissingTableError(workersRes.error))
        throw new Error(workersRes.error.message);
      if (projectsRes.error && !isMissingTableError(projectsRes.error))
        throw new Error(projectsRes.error.message);

      return NextResponse.json(
        {
          ok: true,
          entries,
          workers: (workersRes.data ?? []) as Array<{ id: string; name: string }>,
          projects: (projectsRes.data ?? []) as Array<{ id: string; name: string }>,
        },
        { headers: NO_CACHE_HEADERS }
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load labor entries.";
      return apiError(500, message);
    }
  }

  const date = searchParams.get("date")?.trim() ?? "";

  try {
    let entryQuery = supabase
      .from("labor_entries")
      .select("id,worker_id,project_id,work_date,hours,cost_code,notes")
      .limit(date ? 2000 : 500);
    if (date) {
      entryQuery = entryQuery.eq("work_date", date).order("work_date", { ascending: true });
    } else {
      entryQuery = entryQuery.order("work_date", { ascending: false });
    }

    const [entriesRes, workersRes, projectsRes] = await Promise.all([
      entryQuery,
      supabase
        .from("workers")
        .select("id,name,half_day_rate,daily_rate,status")
        .order("name")
        .limit(500),
      supabase.from("projects").select("id,name").order("name").limit(500),
    ]);

    const missingLaborTable = Boolean(entriesRes.error && isMissingTableError(entriesRes.error));
    if (entriesRes.error && !missingLaborTable) throw new Error(entriesRes.error.message);
    if (workersRes.error && !isMissingTableError(workersRes.error))
      throw new Error(workersRes.error.message);
    if (projectsRes.error && !isMissingTableError(projectsRes.error))
      throw new Error(projectsRes.error.message);

    const workerRows = (workersRes.data ?? []) as Array<{
      id: string;
      name: string;
      half_day_rate?: number | null;
      daily_rate?: number | null;
      status?: string | null;
    }>;
    const effectiveRateByWorkerId = new Map<string, number>();
    if (date) {
      await Promise.all(
        workerRows.map(async (row) => {
          const effective = await resolveWorkerDailyRateForDateWithClient(supabase, row.id, date);
          effectiveRateByWorkerId.set(row.id, effective.dailyRate);
        })
      );
    }

    return NextResponse.json(
      {
        ok: true,
        missingLaborTable,
        entries: entriesRes.error
          ? []
          : (entriesRes.data ?? []).map((entry: { notes?: string | null }) => ({
              ...entry,
              overtime_hours: parseLaborOvertimeHoursFromNotes(entry.notes),
              overtime_amount: parseLaborOvertimeAmountFromNotes(entry.notes),
            })),
        workers: workerRows
          .map((row) => {
            const effectiveDailyRate = effectiveRateByWorkerId.get(row.id);
            return {
              id: row.id,
              name: row.name ?? "",
              halfDayRate: effectiveDailyRate ?? safeNumber(row.half_day_rate),
              dailyRate:
                effectiveDailyRate ?? (safeNumber(row.daily_rate) || safeNumber(row.half_day_rate)),
              status: row.status ?? "active",
            };
          })
          .filter((w) => w.status !== "inactive"),
        projects: (projectsRes.data ?? []) as Array<{ id: string; name: string }>,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load labor entries.";
    return apiError(500, message);
  }
}

export async function POST(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const body = (await request.json().catch(() => null)) as LaborEntryPayload | null;
    if (!body) return apiError(400, "Invalid JSON body.");
    if (Array.isArray(body.rows)) {
      const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
      const workDate =
        typeof body.workDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.workDate)
          ? body.workDate.slice(0, 10)
          : "";
      if (!projectId) return apiError(400, "Project is required.");
      if (!workDate) return apiError(400, "Work date is required.");

      const rows = (body.rows as DailyLaborInput[])
        .map((row) => ({
          workerId: typeof row.workerId === "string" ? row.workerId.trim() : "",
          morning: row.morning === true,
          afternoon: row.afternoon === true,
          otHours: readLaborOvertimeHoursInput(row),
          otAmount: readLaborOvertimeAmountInput(row),
        }))
        .filter((row) => row.workerId && (row.morning || row.afternoon));
      const entries = await insertDailyLaborEntriesWithClient(supabase, projectId, workDate, rows, {
        notes: typeof body.notes === "string" ? body.notes : undefined,
        costCode: typeof body.costCode === "string" ? body.costCode : undefined,
      });
      return NextResponse.json({ ok: true, entries }, { headers: NO_CACHE_HEADERS });
    }
    const payload = toPayload(body);
    const snapshot = await buildLaborEntryRateSnapshotWithClient(supabase, {
      workerId: payload.worker_id,
      workDate: payload.work_date,
      hours: payload.hours,
    });
    const { data, error } = await supabase
      .from("labor_entries")
      .insert({ ...payload, ...snapshot })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(
      { ok: true, id: (data as { id: string }).id },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save labor entry.";
    return apiError(500, message);
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const body = (await request.json().catch(() => null)) as
      | (LaborEntryPayload & { id?: unknown })
      | null;
    if (!body) return apiError(400, "Invalid JSON body.");
    if (safeString(body.action)) {
      await runBulkAction(supabase, body);
    } else if (safeString(body.mode) === "daily-entry") {
      await updateDailyEntry(supabase, body);
    } else if (safeString(body.mode) === "session-entry" || toSession(body.session)) {
      await updateSessionEntry(supabase, body);
    } else {
      const id = safeString(body.id);
      if (!id) return apiError(400, "Labor entry id is required.");
      const payload = toPayload(body);
      const snapshot = await buildLaborEntryRateSnapshotWithClient(supabase, {
        workerId: payload.worker_id,
        workDate: payload.work_date,
        hours: payload.hours,
      });
      const { data: updated, error } = await supabase
        .from("labor_entries")
        .update({ ...payload, ...snapshot })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) throw new Error("Labor entry not found.");
    }
    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save labor entry.";
    return apiError(500, message);
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) return apiError(400, "Labor entry id is required.");

  try {
    const { error } = await supabase.from("labor_entries").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete labor entry.";
    return apiError(500, message);
  }
}
