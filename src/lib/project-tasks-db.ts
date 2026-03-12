/**
 * Project tasks — Supabase only. Table: project_tasks.
 * Filter by project_id; indexes on project_id, created_at, status.
 */

import { supabase } from "@/lib/supabase";

export type ProjectTaskStatus = "todo" | "in_progress" | "done";
export type ProjectTaskPriority = "low" | "medium" | "high";

export type ProjectTask = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  assigned_worker_id: string | null;
  due_date: string | null;
  priority: ProjectTaskPriority;
  created_at: string;
};

export type ProjectTaskDraft = {
  project_id: string;
  title: string;
  description?: string | null;
  status?: ProjectTaskStatus;
  assigned_worker_id?: string | null;
  due_date?: string | null;
  priority?: ProjectTaskPriority;
};

export type ProjectTaskWithWorker = ProjectTask & { worker_name: string | null };

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS = "id, project_id, title, description, status, assigned_worker_id, due_date, priority, created_at";

function toTask(r: Record<string, unknown>): ProjectTask {
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    title: (r.title as string) ?? "",
    description: (r.description as string | null) ?? null,
    status: (r.status as ProjectTaskStatus) ?? "todo",
    assigned_worker_id: (r.assigned_worker_id as string | null) ?? null,
    due_date: r.due_date != null ? String(r.due_date).slice(0, 10) : null,
    priority: (r.priority as ProjectTaskPriority) ?? "medium",
    created_at: (r.created_at as string) ?? "",
  };
}

/** Get all tasks across all projects (for Operations Tasks page), with project and worker names. */
export async function getAllTasksWithProject(): Promise<(ProjectTaskWithWorker & { project_name: string | null })[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_tasks")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load tasks.");
  const tasks = (rows ?? []).map((r) => toTask(r as Record<string, unknown>));
  const projectIds = Array.from(new Set(tasks.map((t) => t.project_id)));
  const workerIds = Array.from(new Set(tasks.map((t) => t.assigned_worker_id).filter(Boolean))) as string[];
  const [projectsRes, workersRes] = await Promise.all([
    projectIds.length ? c.from("projects").select("id, name").in("id", projectIds) : { data: [] },
    workerIds.length ? c.from("workers").select("id, name").in("id", workerIds) : { data: [] },
  ]);
  const projectNames = new Map<string, string>(((projectsRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name ?? ""]));
  const workerNames = new Map<string, string>(((workersRes.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name ?? ""]));
  return tasks.map((t) => ({
    ...t,
    project_name: projectNames.get(t.project_id) ?? null,
    worker_name: t.assigned_worker_id ? workerNames.get(t.assigned_worker_id) ?? null : null,
  }));
}

/** Get all tasks for a project, with worker names when assigned_worker_id is set. */
export async function getProjectTasks(projectId: string): Promise<ProjectTaskWithWorker[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_tasks")
    .select(COLS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load tasks.");
  const tasks = (rows ?? []).map((r) => toTask(r as Record<string, unknown>));
  const workerIds = Array.from(new Set(tasks.map((t) => t.assigned_worker_id).filter(Boolean))) as string[];
  const workerNames = new Map<string, string>();
  if (workerIds.length > 0) {
    const { data: workers } = await c.from("workers").select("id, name").in("id", workerIds);
    (workers ?? []).forEach((w: { id: string; name: string }) => workerNames.set(w.id, w.name ?? ""));
  }
  return tasks.map((t) => ({
    ...t,
    worker_name: t.assigned_worker_id ? workerNames.get(t.assigned_worker_id) ?? null : null,
  }));
}

/** Get one task by id. */
export async function getProjectTaskById(taskId: string): Promise<ProjectTask | null> {
  const c = client();
  const { data: row, error } = await c.from("project_tasks").select(COLS).eq("id", taskId).maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load task.");
  return row ? toTask(row as Record<string, unknown>) : null;
}

/** Create a task. */
export async function createProjectTask(draft: ProjectTaskDraft): Promise<ProjectTask> {
  const c = client();
  const { data: row, error } = await c
    .from("project_tasks")
    .insert({
      project_id: draft.project_id,
      title: draft.title.trim() || "Untitled",
      description: draft.description?.trim() || null,
      status: draft.status ?? "todo",
      assigned_worker_id: draft.assigned_worker_id ?? null,
      due_date: draft.due_date?.slice(0, 10) ?? null,
      priority: draft.priority ?? "medium",
    })
    .select(COLS)
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create task.");
  return toTask(row as Record<string, unknown>);
}

/** Update a task. Returns updated task or null. */
export async function updateProjectTask(
  taskId: string,
  patch: Partial<Pick<ProjectTask, "title" | "description" | "status" | "assigned_worker_id" | "due_date" | "priority">>
): Promise<ProjectTask | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.description !== undefined) updates.description = patch.description?.trim() ?? null;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.assigned_worker_id !== undefined) updates.assigned_worker_id = patch.assigned_worker_id;
  if (patch.due_date !== undefined) updates.due_date = patch.due_date?.slice(0, 10) ?? null;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (Object.keys(updates).length === 0) return getProjectTaskById(taskId);
  const { data: row, error } = await c.from("project_tasks").update(updates).eq("id", taskId).select(COLS).single();
  if (error || !row) return null;
  return toTask(row as Record<string, unknown>);
}

/** Delete a task. */
export async function deleteProjectTask(taskId: string): Promise<void> {
  const c = client();
  const { error } = await c.from("project_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message ?? "Failed to delete task.");
}
