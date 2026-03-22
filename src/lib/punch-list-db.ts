/**
 * Punch list — Supabase only. Table: punch_list.
 * Priority: Low | Medium | High | Urgent. Status: open | assigned | completed.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type PunchListPriority = "Low" | "Medium" | "High" | "Urgent";
export type PunchListStatus = "open" | "assigned" | "completed";

export type PunchListItem = {
  id: string;
  project_id: string;
  issue: string;
  location: string | null;
  description: string | null;
  assigned_worker_id: string | null;
  priority: string;
  status: string;
  photo_url: string | null;
  photo_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
};

export type PunchListItemWithJoins = PunchListItem & {
  project_name: string | null;
  worker_name: string | null;
  /** When photo_id is set, resolved site photo URL for display. */
  site_photo_url: string | null;
};

export type PunchListDraft = {
  project_id: string;
  issue: string;
  location?: string | null;
  description?: string | null;
  assigned_worker_id?: string | null;
  priority?: string;
  status?: string;
  photo_url?: string | null;
  photo_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
};

export type PunchListSummary = { open: number; assigned: number; completed: number };

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

const COLS =
  "id, project_id, issue, location, description, assigned_worker_id, priority, status, photo_url, photo_id, notes, created_by, created_at, completed_at";
const COLS_BASE =
  "id, project_id, issue, location, assigned_worker_id, status, photo_url, notes, created_at";

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /column.*does not exist|does not exist.*column|undefined column|could not find the.*column|schema cache.*column/i.test(
    m
  );
}

function toItem(r: Record<string, unknown>, extended = true): PunchListItem {
  const status = (r.status as string) ?? "open";
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    issue: (r.issue as string) ?? "",
    location: (r.location as string | null) ?? null,
    description: extended ? ((r.description as string | null) ?? null) : null,
    assigned_worker_id: (r.assigned_worker_id as string | null) ?? null,
    priority: extended ? ((r.priority as string) ?? "Medium") : "Medium",
    status: status === "in_progress" ? "assigned" : status === "resolved" ? "completed" : status,
    photo_url: (r.photo_url as string | null) ?? null,
    photo_id: extended ? ((r.photo_id as string | null) ?? null) : null,
    notes: (r.notes as string | null) ?? null,
    created_by: extended ? ((r.created_by as string | null) ?? null) : null,
    created_at: (r.created_at as string) ?? "",
    completed_at: extended ? ((r.completed_at as string | null) ?? null) : null,
  };
}

async function joinItems(
  c: ReturnType<typeof client>,
  items: PunchListItem[]
): Promise<PunchListItemWithJoins[]> {
  const projectIds = Array.from(new Set(items.map((i) => i.project_id)));
  const workerIds = Array.from(
    new Set(items.map((i) => i.assigned_worker_id).filter(Boolean))
  ) as string[];
  const photoIds = Array.from(new Set(items.map((i) => i.photo_id).filter(Boolean))) as string[];
  const [projectsRes, workersRes, sitePhotosRes] = await Promise.all([
    projectIds.length ? c.from("projects").select("id, name").in("id", projectIds) : { data: [] },
    workerIds.length ? c.from("workers").select("id, name").in("id", workerIds) : { data: [] },
    photoIds.length
      ? c.from("site_photos").select("id, photo_url").in("id", photoIds)
      : { data: [] },
  ]);
  const projectNames = new Map<string, string>(
    ((projectsRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name ?? ""])
  );
  const workerNames = new Map<string, string>(
    ((workersRes.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name ?? ""])
  );
  const sitePhotoUrls = new Map<string, string>(
    ((sitePhotosRes.data ?? []) as { id: string; photo_url: string }[]).map((s) => [
      s.id,
      s.photo_url ?? "",
    ])
  );
  return items.map((i) => ({
    ...i,
    project_name: projectNames.get(i.project_id) ?? null,
    worker_name: i.assigned_worker_id ? (workerNames.get(i.assigned_worker_id) ?? null) : null,
    site_photo_url: i.photo_id ? (sitePhotoUrls.get(i.photo_id) ?? null) : null,
  }));
}

/** Get all punch list items with project and worker names. */
export async function getPunchListAll(): Promise<PunchListItemWithJoins[]> {
  const c = client();
  let rows: unknown[] | null = null;
  let error: { message?: string } | null = null;
  let extended = true;
  const res = await c.from("punch_list").select(COLS).order("created_at", { ascending: false });
  error = res.error;
  rows = res.data;
  if (error && isMissingColumn(error)) {
    const fallback = await c
      .from("punch_list")
      .select(COLS_BASE)
      .order("created_at", { ascending: false });
    if (!fallback.error) {
      rows = fallback.data;
      extended = false;
      error = null;
    }
  }
  if (error) throw new Error(error.message ?? "Failed to load punch list.");
  const items = (rows ?? []).map((r) => toItem(r as Record<string, unknown>, extended));
  return await joinItems(c, items);
}

/** Get punch list items for a project. */
export async function getPunchListByProject(projectId: string): Promise<PunchListItemWithJoins[]> {
  const c = client();
  let rows: unknown[] | null = null;
  let extended = true;
  const res = await c
    .from("punch_list")
    .select(COLS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (res.error && isMissingColumn(res.error)) {
    const fallback = await c
      .from("punch_list")
      .select(COLS_BASE)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (!fallback.error) {
      rows = fallback.data;
      extended = false;
    }
  } else {
    rows = res.data;
  }
  if (res.error && !rows) throw new Error(res.error.message ?? "Failed to load punch list.");
  const items = (rows ?? []).map((r) => toItem(r as Record<string, unknown>, extended));
  return await joinItems(c, items);
}

/** Get counts by status for dashboard summary. */
export async function getPunchListSummary(): Promise<PunchListSummary> {
  const c = client();
  const { data: rows, error } = await c.from("punch_list").select("status");
  if (error) return { open: 0, assigned: 0, completed: 0 };
  const list = (rows ?? []) as { status: string }[];
  const norm = (s: string) =>
    s === "in_progress" ? "assigned" : s === "resolved" ? "completed" : s;
  return {
    open: list.filter((r) => norm(r.status) === "open").length,
    assigned: list.filter((r) => norm(r.status) === "assigned").length,
    completed: list.filter((r) => norm(r.status) === "completed").length,
  };
}

/** Create a punch list item. */
export async function createPunchListItem(draft: PunchListDraft): Promise<PunchListItem> {
  const c = client();
  const payload: Record<string, unknown> = {
    project_id: draft.project_id,
    issue: draft.issue.trim() || "Issue",
    location: draft.location?.trim() || null,
    description: draft.description?.trim() || null,
    assigned_worker_id: draft.assigned_worker_id ?? null,
    priority: draft.priority ?? "Medium",
    status: draft.status ?? "open",
    photo_url: draft.photo_url?.trim() || null,
    photo_id: draft.photo_id ?? null,
    notes: draft.notes?.trim() || null,
    created_by: draft.created_by?.trim() || null,
  };
  let result = await c.from("punch_list").insert(payload).select(COLS).single();
  if (result.error && isMissingColumn(result.error)) {
    const base = { ...payload };
    delete base.description;
    delete base.priority;
    delete base.created_by;
    delete base.photo_id;
    result = await c.from("punch_list").insert(base).select(COLS_BASE).single();
  }
  if (result.error || !result.data)
    throw new Error(result.error?.message ?? "Failed to create punch list item.");
  const row = result.data as Record<string, unknown>;
  return toItem(row, "priority" in row);
}

/** Update a punch list item. Sets completed_at when status becomes completed. */
export async function updatePunchListItem(
  id: string,
  patch: Partial<
    Pick<
      PunchListItem,
      | "issue"
      | "location"
      | "description"
      | "assigned_worker_id"
      | "priority"
      | "status"
      | "photo_url"
      | "notes"
    >
  >
): Promise<PunchListItem | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.issue !== undefined) updates.issue = patch.issue.trim();
  if (patch.location !== undefined) updates.location = patch.location?.trim() ?? null;
  if (patch.description !== undefined) updates.description = patch.description?.trim() ?? null;
  if (patch.assigned_worker_id !== undefined) updates.assigned_worker_id = patch.assigned_worker_id;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.status !== undefined) {
    updates.status = patch.status;
    if (patch.status === "completed") updates.completed_at = new Date().toISOString();
  }
  if (patch.photo_url !== undefined) updates.photo_url = patch.photo_url?.trim() ?? null;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() ?? null;
  if (Object.keys(updates).length === 0) return null;
  let result = await c.from("punch_list").update(updates).eq("id", id).select(COLS).single();
  if (result.error && isMissingColumn(result.error)) {
    const rest: Record<string, unknown> = {};
    if ("issue" in updates) rest.issue = updates.issue;
    if ("location" in updates) rest.location = updates.location;
    if ("assigned_worker_id" in updates) rest.assigned_worker_id = updates.assigned_worker_id;
    if ("status" in updates) rest.status = updates.status;
    if ("photo_url" in updates) rest.photo_url = updates.photo_url;
    if ("notes" in updates) rest.notes = updates.notes;
    if (Object.keys(rest).length > 0) {
      result = await c.from("punch_list").update(rest).eq("id", id).select(COLS_BASE).single();
    }
  }
  if (result.error || !result.data) return null;
  return toItem(
    result.data as Record<string, unknown>,
    "priority" in (result.data as Record<string, unknown>)
  );
}

/** Delete a punch list item. */
export async function deletePunchListItem(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("punch_list").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete punch list item.");
}
