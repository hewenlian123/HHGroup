/**
 * Inspection log — Supabase only. Table: inspection_log.
 */

import { supabase } from "@/lib/supabase";

export type InspectionLogStatus = "passed" | "failed" | "pending";

export type InspectionLogEntry = {
  id: string;
  project_id: string;
  inspection_type: string;
  inspector: string | null;
  inspection_date: string | null;
  status: InspectionLogStatus;
  notes: string | null;
  created_at: string;
};

export type InspectionLogEntryWithProject = InspectionLogEntry & {
  project_name: string | null;
};

export type InspectionLogDraft = {
  project_id: string;
  inspection_type: string;
  inspector?: string | null;
  inspection_date?: string | null;
  status?: InspectionLogStatus;
  notes?: string | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS = "id, project_id, inspection_type, inspector, inspection_date, status, notes, created_at";

function toRow(r: Record<string, unknown>): InspectionLogEntry {
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    inspection_type: (r.inspection_type as string) ?? "",
    inspector: (r.inspector as string | null) ?? null,
    inspection_date: r.inspection_date != null ? String(r.inspection_date).slice(0, 10) : null,
    status: (r.status as InspectionLogStatus) ?? "pending",
    notes: (r.notes as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
  };
}

/** Get all inspection log entries with project name. */
export async function getInspectionLogs(): Promise<InspectionLogEntryWithProject[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("inspection_log")
    .select(COLS)
    .order("inspection_date", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message ?? "Failed to load inspection log.");
  const items = (rows ?? []).map((r) => toRow(r as Record<string, unknown>));
  const projectIds = Array.from(new Set(items.map((i) => i.project_id)));
  if (projectIds.length === 0) return items.map((i) => ({ ...i, project_name: null }));
  const { data: projects } = await c.from("projects").select("id, name").in("id", projectIds);
  const projectNames = new Map<string, string>(((projects ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name ?? ""]));
  return items.map((i) => ({
    ...i,
    project_name: projectNames.get(i.project_id) ?? null,
  }));
}

/** Get one inspection log entry by id. */
export async function getInspectionLogById(id: string): Promise<InspectionLogEntryWithProject | null> {
  const c = client();
  const { data: row, error } = await c.from("inspection_log").select(COLS).eq("id", id).maybeSingle();
  if (error || !row) return null;
  const item = toRow(row as Record<string, unknown>);
  const { data: proj } = await c.from("projects").select("id, name").eq("id", item.project_id).maybeSingle();
  const project_name = (proj as { name?: string } | null)?.name ?? null;
  return { ...item, project_name };
}

/** Create an inspection log entry. */
export async function createInspectionLog(draft: InspectionLogDraft): Promise<InspectionLogEntry> {
  const c = client();
  const status = (draft.status as InspectionLogStatus) ?? "pending";
  const { data: row, error } = await c
    .from("inspection_log")
    .insert({
      project_id: draft.project_id,
      inspection_type: draft.inspection_type.trim() || "Inspection",
      inspector: draft.inspector?.trim() ?? null,
      inspection_date: draft.inspection_date?.slice(0, 10) ?? null,
      status,
      notes: draft.notes?.trim() ?? null,
    })
    .select(COLS)
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create inspection log entry.");
  return toRow(row as Record<string, unknown>);
}

/** Update an inspection log entry. */
export async function updateInspectionLog(
  id: string,
  patch: Partial<Pick<InspectionLogEntry, "inspection_type" | "inspector" | "inspection_date" | "status" | "notes">>
): Promise<InspectionLogEntry | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.inspection_type !== undefined) updates.inspection_type = patch.inspection_type.trim();
  if (patch.inspector !== undefined) updates.inspector = patch.inspector?.trim() ?? null;
  if (patch.inspection_date !== undefined) updates.inspection_date = patch.inspection_date?.slice(0, 10) ?? null;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() ?? null;
  if (Object.keys(updates).length === 0) return null;
  const { data: row, error } = await c.from("inspection_log").update(updates).eq("id", id).select(COLS).single();
  if (error || !row) return null;
  return toRow(row as Record<string, unknown>);
}

/** Delete an inspection log entry. */
export async function deleteInspectionLog(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("inspection_log").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete inspection log entry.");
}
