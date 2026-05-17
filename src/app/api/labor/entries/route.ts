import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

type LaborEntryPayload = {
  workerId?: unknown;
  projectId?: unknown;
  workDate?: unknown;
  hours?: unknown;
  costCode?: unknown;
  notes?: unknown;
  costAmount?: unknown;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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
  const workerId = typeof input.workerId === "string" ? input.workerId.trim() : "";
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const workDate =
    typeof input.workDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(input.workDate)
      ? input.workDate.slice(0, 10)
      : "";
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
    cost_code:
      typeof input.costCode === "string" && input.costCode.trim() ? input.costCode.trim() : null,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
    cost_amount: safeNumber(input.costAmount),
  };
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
      supabase.from("workers").select("id,name,half_day_rate").order("name").limit(500),
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
        workers: (workersRes.data ?? []).map((w) => {
          const row = w as { id: string; name: string; half_day_rate?: number | null };
          return { id: row.id, name: row.name ?? "", halfDayRate: safeNumber(row.half_day_rate) };
        }),
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
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return apiError(400, "Labor entry id is required.");
    const payload = toPayload(body);
    const { error } = await supabase.from("labor_entries").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
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
