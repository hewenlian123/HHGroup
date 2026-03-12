/**
 * Activity logs — Supabase only. Table: activity_logs.
 * Project-scoped events; indexes on project_id, created_at.
 */

import { supabase } from "@/lib/supabase";

export type ActivityLog = {
  id: string;
  project_id: string;
  type: string;
  description: string;
  created_at: string;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/** Get activity logs for a project, newest first. */
export async function getActivityLogsByProject(projectId: string, limit = 100): Promise<ActivityLog[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("activity_logs")
    .select("id, project_id, type, description, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message ?? "Failed to load activity.");
  return (rows ?? []).map((r) => ({
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    type: (r.type as string) ?? "",
    description: (r.description as string) ?? "",
    created_at: (r.created_at as string) ?? "",
  }));
}

/** Insert an activity log (e.g. task_completed from app). */
export async function insertActivityLog(projectId: string, type: string, description: string): Promise<ActivityLog> {
  const c = client();
  const { data: row, error } = await c
    .from("activity_logs")
    .insert({ project_id: projectId, type, description })
    .select("id, project_id, type, description, created_at")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to log activity.");
  return {
    id: (row.id as string) ?? "",
    project_id: (row.project_id as string) ?? "",
    type: (row.type as string) ?? "",
    description: (row.description as string) ?? "",
    created_at: (row.created_at as string) ?? "",
  };
}
