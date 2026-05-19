import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { insertDailyLaborEntriesWithClient } from "@/lib/labor-db";

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
  session?: unknown;
  rows?: unknown;
};

type DailyLaborInput = {
  workerId?: unknown;
  morning?: unknown;
  afternoon?: unknown;
  otHours?: unknown;
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

  return {
    worker_id: workerId,
    project_id: projectId,
    work_date: workDate,
    hours,
    cost_code: safeString(input.costCode ?? input.cost_code) || null,
    notes: safeString(input.notes) || null,
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

async function resolveHourlyRate(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseInternal>>,
  workerId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, half_day_rate, daily_rate")
    .eq("id", workerId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load worker rate.");
  const row = (data ?? {}) as { half_day_rate?: number | null; daily_rate?: number | null };
  const dailyRate =
    row.daily_rate != null && Number(row.daily_rate) > 0
      ? Number(row.daily_rate)
      : Number(row.half_day_rate) || 0;
  return dailyRate > 0 ? dailyRate / 8 : 0;
}

async function updateSessionEntry(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseInternal>>,
  body: LaborEntryPayload
): Promise<void> {
  const id = safeString(body.id);
  if (!id) throw new Error("Labor entry id is required.");

  const { data: current, error: curErr } = await supabase
    .from("labor_entries")
    .select("id, worker_id, work_date, morning, afternoon, status")
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
  const payload: Record<string, unknown> = {
    project_id: safeString(body.projectId ?? body.project_id) || null,
    hours: safeNumber(body.hours),
    cost_amount: safeNumber(body.costAmount ?? body.cost_amount),
    notes: safeString(body.notes) || null,
    morning: flags.morning,
    afternoon: flags.afternoon,
  };

  const { error } = await supabase.from("labor_entries").update(payload).eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to update labor entry.");
}

async function updateDailyEntry(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseInternal>>,
  body: LaborEntryPayload
): Promise<void> {
  const id = safeString(body.id);
  if (!id) throw new Error("Labor entry id is required.");

  const { data: current, error: curErr } = await supabase
    .from("labor_entries")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (curErr) throw new Error(curErr.message ?? "Failed to load labor entry.");
  if (!current) throw new Error("Labor entry not found.");
  if ((current as { status?: string | null }).status === "Locked") {
    throw new Error("Cannot edit a locked labor entry.");
  }

  const workerId = safeString(body.workerId ?? body.worker_id);
  if (!workerId) throw new Error("Worker is required.");
  const hours = safeNumber(body.hours);
  const hourlyRate = await resolveHourlyRate(supabase, workerId);
  const payload = {
    worker_id: workerId,
    project_id: safeString(body.projectId ?? body.project_id) || null,
    hours,
    cost_code: safeString(body.costCode ?? body.cost_code) || null,
    notes: safeString(body.notes) || null,
    cost_amount: hours * hourlyRate,
  };

  const { error } = await supabase.from("labor_entries").update(payload).eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to update labor entry.");
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

    return NextResponse.json(
      {
        ok: true,
        missingLaborTable,
        entries: entriesRes.error ? [] : (entriesRes.data ?? []),
        workers: (workersRes.data ?? [])
          .map((w) => {
            const row = w as {
              id: string;
              name: string;
              half_day_rate?: number | null;
              daily_rate?: number | null;
              status?: string | null;
            };
            return {
              id: row.id,
              name: row.name ?? "",
              halfDayRate: safeNumber(row.half_day_rate),
              dailyRate: safeNumber(row.daily_rate) || safeNumber(row.half_day_rate),
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
          otHours: safeNumber(row.otHours),
        }))
        .filter((row) => row.workerId && (row.morning || row.afternoon));
      const entries = await insertDailyLaborEntriesWithClient(supabase, projectId, workDate, rows, {
        notes: typeof body.notes === "string" ? body.notes : undefined,
        costCode: typeof body.costCode === "string" ? body.costCode : undefined,
      });
      return NextResponse.json({ ok: true, entries }, { headers: NO_CACHE_HEADERS });
    }
    const payload = toPayload(body);
    const { data, error } = await supabase
      .from("labor_entries")
      .insert(payload)
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
      const { error } = await supabase.from("labor_entries").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
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
