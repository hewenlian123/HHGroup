/**
 * Punch list — Supabase only. Table: punch_list.
 */

import { supabase } from "@/lib/supabase";

export type PunchListItem = {
  id: string;
  project_id: string;
  issue: string;
  location: string | null;
  assigned_worker_id: string | null;
  status: string;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
};

export type PunchListItemWithJoins = PunchListItem & {
  project_name: string | null;
  worker_name: string | null;
};

export type PunchListDraft = {
  project_id: string;
  issue: string;
  location?: string | null;
  assigned_worker_id?: string | null;
  status?: string;
  photo_url?: string | null;
  notes?: string | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS = "id, project_id, issue, location, assigned_worker_id, status, photo_url, notes, created_at";
const COLS_NO_NOTES = "id, project_id, issue, location, assigned_worker_id, status, photo_url, created_at";

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /column.*does not exist|does not exist.*column|undefined column/i.test(m);
}

function toItem(r: Record<string, unknown>, hasNotes = true): PunchListItem {
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    issue: (r.issue as string) ?? "",
    location: (r.location as string | null) ?? null,
    assigned_worker_id: (r.assigned_worker_id as string | null) ?? null,
    status: (r.status as string) ?? "open",
    photo_url: (r.photo_url as string | null) ?? null,
    notes: hasNotes ? ((r.notes as string | null) ?? null) : null,
    created_at: (r.created_at as string) ?? "",
  };
}

/** Get all punch list items with project and worker names. */
export async function getPunchListAll(): Promise<PunchListItemWithJoins[]> {
  const c = client();
  let rows: unknown[] | null = null;
  let error: { message?: string } | null = null;
  let useNotes = true;
  const res = await c.from("punch_list").select(COLS).order("created_at", { ascending: false });
  error = res.error;
  rows = res.data;
  if (error && isMissingColumn(error)) {
    const fallback = await c.from("punch_list").select(COLS_NO_NOTES).order("created_at", { ascending: false });
    if (!fallback.error) {
      rows = fallback.data;
      useNotes = false;
      error = null;
    }
  }
  if (error) throw new Error(error.message ?? "Failed to load punch list.");
  const items = (rows ?? []).map((r) => toItem(r as Record<string, unknown>, useNotes));
  const projectIds = Array.from(new Set(items.map((i) => i.project_id)));
  const workerIds = Array.from(new Set(items.map((i) => i.assigned_worker_id).filter(Boolean))) as string[];
  const [projectsRes, workersRes] = await Promise.all([
    projectIds.length ? c.from("projects").select("id, name").in("id", projectIds) : { data: [] },
    workerIds.length ? c.from("workers").select("id, name").in("id", workerIds) : { data: [] },
  ]);
  const projectNames = new Map<string, string>(((projectsRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name ?? ""]));
  const workerNames = new Map<string, string>(((workersRes.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name ?? ""]));
  return items.map((i) => ({
    ...i,
    project_name: projectNames.get(i.project_id) ?? null,
    worker_name: i.assigned_worker_id ? workerNames.get(i.assigned_worker_id) ?? null : null,
  }));
}

/** Create a punch list item. */
export async function createPunchListItem(draft: PunchListDraft): Promise<PunchListItem> {
  const c = client();
  const base: Record<string, unknown> = {
    project_id: draft.project_id,
    issue: draft.issue.trim() || "Issue",
    location: draft.location?.trim() || null,
    assigned_worker_id: draft.assigned_worker_id ?? null,
    status: draft.status ?? "open",
    photo_url: draft.photo_url?.trim() || null,
  };
  let result = await c.from("punch_list").insert({ ...base, notes: draft.notes?.trim() || null }).select(COLS).single();
  if (result.error && isMissingColumn(result.error)) {
    result = await c.from("punch_list").insert(base).select(COLS_NO_NOTES).single();
  }
  if (result.error || !result.data) throw new Error(result.error?.message ?? "Failed to create punch list item.");
  const row = result.data as Record<string, unknown>;
  return toItem(row, "notes" in row);
}

/** Update a punch list item. */
export async function updatePunchListItem(
  id: string,
  patch: Partial<Pick<PunchListItem, "issue" | "location" | "assigned_worker_id" | "status" | "photo_url" | "notes">>
): Promise<PunchListItem | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.issue !== undefined) updates.issue = patch.issue.trim();
  if (patch.location !== undefined) updates.location = patch.location?.trim() ?? null;
  if (patch.assigned_worker_id !== undefined) updates.assigned_worker_id = patch.assigned_worker_id;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.photo_url !== undefined) updates.photo_url = patch.photo_url?.trim() ?? null;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() ?? null;
  if (Object.keys(updates).length === 0) return null;
  let result = await c.from("punch_list").update(updates).eq("id", id).select(COLS).single();
  if (result.error && isMissingColumn(result.error) && "notes" in updates) {
    const rest = { ...updates };
    delete (rest as Record<string, unknown>).notes;
    if (Object.keys(rest).length > 0) {
      result = await c.from("punch_list").update(rest).eq("id", id).select(COLS_NO_NOTES).single();
    }
  }
  if (result.error || !result.data) return null;
  return toItem(result.data as Record<string, unknown>, "notes" in (result.data as Record<string, unknown>));
}

/** Delete a punch list item. */
export async function deletePunchListItem(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("punch_list").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete punch list item.");
}
