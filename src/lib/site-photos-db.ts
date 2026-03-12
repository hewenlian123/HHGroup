/**
 * Site photos — Supabase only. Table: site_photos.
 */

import { supabase } from "@/lib/supabase";

export type SitePhoto = {
  id: string;
  project_id: string;
  photo_url: string;
  description: string | null;
  tags: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type SitePhotoWithProject = SitePhoto & {
  project_name: string | null;
};

export type SitePhotoDraft = {
  project_id: string;
  photo_url: string;
  description?: string | null;
  tags?: string | null;
  uploaded_by?: string | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS = "id, project_id, photo_url, description, tags, uploaded_by, created_at";

function toRow(r: Record<string, unknown>): SitePhoto {
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    photo_url: (r.photo_url as string) ?? "",
    description: (r.description as string | null) ?? null,
    tags: (r.tags as string | null) ?? null,
    uploaded_by: (r.uploaded_by as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
  };
}

/** Get site photos, optionally filtered by project_id. */
export async function getSitePhotos(projectId?: string | null): Promise<SitePhotoWithProject[]> {
  const c = client();
  let q = c.from("site_photos").select(COLS).order("created_at", { ascending: false });
  if (projectId?.trim()) {
    q = q.eq("project_id", projectId.trim());
  }
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message ?? "Failed to load site photos.");
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

/** Get one site photo by id. */
export async function getSitePhotoById(id: string): Promise<SitePhotoWithProject | null> {
  const c = client();
  const { data: row, error } = await c.from("site_photos").select(COLS).eq("id", id).maybeSingle();
  if (error || !row) return null;
  const item = toRow(row as Record<string, unknown>);
  const { data: proj } = await c.from("projects").select("id, name").eq("id", item.project_id).maybeSingle();
  const project_name = (proj as { name?: string } | null)?.name ?? null;
  return { ...item, project_name };
}

/** Create a site photo. */
export async function createSitePhoto(draft: SitePhotoDraft): Promise<SitePhoto> {
  const c = client();
  const { data: row, error } = await c
    .from("site_photos")
    .insert({
      project_id: draft.project_id,
      photo_url: draft.photo_url.trim(),
      description: draft.description?.trim() ?? null,
      tags: draft.tags?.trim() ?? null,
      uploaded_by: draft.uploaded_by?.trim() ?? null,
    })
    .select(COLS)
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create site photo.");
  return toRow(row as Record<string, unknown>);
}

/** Update a site photo. */
export async function updateSitePhoto(
  id: string,
  patch: Partial<Pick<SitePhoto, "description" | "tags" | "uploaded_by">>
): Promise<SitePhoto | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.description !== undefined) updates.description = patch.description?.trim() ?? null;
  if (patch.tags !== undefined) updates.tags = patch.tags?.trim() ?? null;
  if (patch.uploaded_by !== undefined) updates.uploaded_by = patch.uploaded_by?.trim() ?? null;
  if (Object.keys(updates).length === 0) return null;
  const { data: row, error } = await c.from("site_photos").update(updates).eq("id", id).select(COLS).single();
  if (error || !row) return null;
  return toRow(row as Record<string, unknown>);
}

/** Delete a site photo. */
export async function deleteSitePhoto(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("site_photos").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete site photo.");
}
