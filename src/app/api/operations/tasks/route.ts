import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { isTestTask } from "@/lib/project-tasks-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

/** GET: Tasks, projects, workers — query with admin client directly so UI sees same data as DELETE/clear-data. */
export async function GET() {
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false as const, message: "Supabase not configured" }, { status: 500 });
  }
  try {
    const [tasksRes, projectsRes, workersRes] = await Promise.all([
      admin.from("project_tasks").select("id, project_id, title, description, status, assigned_worker_id, due_date, priority, created_at").order("created_at", { ascending: false }),
      admin.from("projects").select("id, name").order("name"),
      admin.from("workers").select("id, name").order("name"),
    ]);
    if (tasksRes.error) throw new Error(tasksRes.error.message ?? "Failed to load tasks");
    if (projectsRes.error) throw new Error(projectsRes.error.message ?? "Failed to load projects");
    if (workersRes.error) throw new Error(workersRes.error.message ?? "Failed to load workers");

    const taskRows = (tasksRes.data ?? []) as Array<Record<string, unknown>>;
    const projects = (projectsRes.data ?? []) as Array<{ id: string; name: string | null }>;
    const workers = (workersRes.data ?? []) as Array<{ id: string; name: string | null }>;

    const projectIds = [...new Set(taskRows.map((t) => t.project_id as string))];
    const workerIds = [...new Set(taskRows.map((t) => t.assigned_worker_id as string).filter(Boolean))];
    const projectNameById = new Map(projects.map((p) => [p.id, p.name ?? null]));
    const workerNameById = new Map(workers.map((w) => [w.id, w.name ?? null]));

    const tasks = taskRows
      .filter((t) => !isTestTask({ title: (t.title as string) ?? "" }))
      .map((t) => ({
        id: t.id,
        project_id: t.project_id,
        project_name: projectNameById.get(t.project_id as string) ?? null,
        title: t.title,
        description: t.description,
        status: t.status,
        assigned_worker_id: t.assigned_worker_id,
        worker_name: t.assigned_worker_id ? workerNameById.get(t.assigned_worker_id as string) ?? null : null,
        due_date: t.due_date,
        priority: t.priority,
        created_at: t.created_at,
      }));

    return NextResponse.json(
      { ok: true as const, tasks, projects, workers },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tasks.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
