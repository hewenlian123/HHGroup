/**
 * Project schedule — Supabase only. Table: project_schedule.
 * Timeline items per project; indexes on project_id, start_date.
 */

import { supabase } from "@/lib/supabase";

export type ProjectScheduleItem = {
  id: string;
  project_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string;
};

export type ProjectScheduleItemDraft = {
  project_id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS = "id, project_id, title, start_date, end_date, status, created_at";

function toItem(r: Record<string, unknown>): ProjectScheduleItem {
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    title: (r.title as string) ?? "",
    start_date: r.start_date != null ? String(r.start_date).slice(0, 10) : null,
    end_date: r.end_date != null ? String(r.end_date).slice(0, 10) : null,
    status: (r.status as string) ?? "scheduled",
    created_at: (r.created_at as string) ?? "",
  };
}

/** Get all schedule items across all projects (for Operations Schedule page), with project name. */
export async function getAllScheduleWithProject(): Promise<(ProjectScheduleItem & { project_name: string | null })[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_schedule")
    .select(COLS)
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message ?? "Failed to load schedule.");
  const items = (rows ?? []).map((r) => toItem(r as Record<string, unknown>));
  const projectIds = [...new Set(items.map((i) => i.project_id))];
  if (projectIds.length === 0) return items.map((i) => ({ ...i, project_name: null }));
  const { data: projects } = await c.from("projects").select("id, name").in("id", projectIds);
  const projectNames = new Map<string, string>(((projects ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name ?? ""]));
  return items.map((i) => ({ ...i, project_name: projectNames.get(i.project_id) ?? null }));
}

/** Get all schedule items for a project. */
export async function getProjectSchedule(projectId: string): Promise<ProjectScheduleItem[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_schedule")
    .select(COLS)
    .eq("project_id", projectId)
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message ?? "Failed to load schedule.");
  return (rows ?? []).map((r) => toItem(r as Record<string, unknown>));
}

/** Create a schedule item. */
export async function createProjectScheduleItem(draft: ProjectScheduleItemDraft): Promise<ProjectScheduleItem> {
  const c = client();
  const { data: row, error } = await c
    .from("project_schedule")
    .insert({
      project_id: draft.project_id,
      title: draft.title.trim() || "Untitled",
      start_date: draft.start_date?.slice(0, 10) ?? null,
      end_date: draft.end_date?.slice(0, 10) ?? null,
      status: draft.status ?? "scheduled",
    })
    .select(COLS)
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create schedule item.");
  return toItem(row as Record<string, unknown>);
}

/** Update a schedule item. */
export async function updateProjectScheduleItem(
  id: string,
  patch: Partial<Pick<ProjectScheduleItem, "title" | "start_date" | "end_date" | "status">>
): Promise<ProjectScheduleItem | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.start_date !== undefined) updates.start_date = patch.start_date?.slice(0, 10) ?? null;
  if (patch.end_date !== undefined) updates.end_date = patch.end_date?.slice(0, 10) ?? null;
  if (patch.status !== undefined) updates.status = patch.status;
  if (Object.keys(updates).length === 0) return null;
  const { data: row, error } = await c.from("project_schedule").update(updates).eq("id", id).select(COLS).single();
  if (error || !row) return null;
  return toItem(row as Record<string, unknown>);
}

/** Delete a schedule item. */
export async function deleteProjectScheduleItem(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("project_schedule").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete schedule item.");
}
