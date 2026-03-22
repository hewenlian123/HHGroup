/**
 * Project material selections — Supabase only. Table: project_material_selections.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type MaterialSelectionStatus = "Selected" | "Pending" | "Ordered";

export type ProjectMaterialSelection = {
  id: string;
  project_id: string;
  item: string;
  category: string;
  material_id: string | null;
  material_name: string;
  supplier: string | null;
  status: MaterialSelectionStatus;
  notes: string | null;
  created_at: string;
};

export type ProjectMaterialSelectionWithMaterial = ProjectMaterialSelection & {
  material_photo_url: string | null;
};

export type ProjectMaterialSelectionDraft = {
  project_id: string;
  item: string;
  category: string;
  material_id?: string | null;
  material_name: string;
  supplier?: string | null;
  status?: MaterialSelectionStatus;
  notes?: string | null;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

const COLS =
  "id, project_id, item, category, material_id, material_name, supplier, status, notes, created_at";

function toRow(r: Record<string, unknown>): ProjectMaterialSelection {
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    item: (r.item as string) ?? "",
    category: (r.category as string) ?? "",
    material_id: (r.material_id as string | null) ?? null,
    material_name: (r.material_name as string) ?? "",
    supplier: (r.supplier as string | null) ?? null,
    status: (r.status as MaterialSelectionStatus) ?? "Pending",
    notes: (r.notes as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
  };
}

/** Get all selections for a project, with material photo_url when material_id is set. */
export async function getSelectionsByProject(
  projectId: string
): Promise<ProjectMaterialSelectionWithMaterial[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_material_selections")
    .select(`${COLS}, material_catalog(photo_url)`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message ?? "Failed to load selections.");
  return (rows ?? []).map((r: Record<string, unknown>) => {
    const sel = toRow(r);
    const catalog = r.material_catalog as { photo_url?: string | null } | null;
    return {
      ...sel,
      material_photo_url: catalog?.photo_url ?? null,
    };
  });
}

/** Create a project material selection. */
export async function createSelection(
  draft: ProjectMaterialSelectionDraft
): Promise<ProjectMaterialSelection> {
  const c = client();
  const { data: row, error } = await c
    .from("project_material_selections")
    .insert({
      project_id: draft.project_id,
      item: draft.item.trim() || "Item",
      category: draft.category.trim() || "",
      material_id: draft.material_id ?? null,
      material_name: draft.material_name.trim() || "",
      supplier: draft.supplier?.trim() ?? null,
      status: (draft.status as MaterialSelectionStatus) ?? "Pending",
      notes: draft.notes?.trim() ?? null,
    })
    .select(COLS)
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create selection.");
  return toRow(row as Record<string, unknown>);
}

/** Update a selection. */
export async function updateSelection(
  id: string,
  patch: Partial<
    Pick<
      ProjectMaterialSelection,
      "item" | "category" | "material_id" | "material_name" | "supplier" | "status" | "notes"
    >
  >
): Promise<ProjectMaterialSelection | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.item !== undefined) updates.item = patch.item.trim();
  if (patch.category !== undefined) updates.category = patch.category.trim();
  if (patch.material_id !== undefined) updates.material_id = patch.material_id;
  if (patch.material_name !== undefined) updates.material_name = patch.material_name.trim();
  if (patch.supplier !== undefined) updates.supplier = patch.supplier?.trim() ?? null;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() ?? null;
  if (Object.keys(updates).length === 0) return null;
  const { data: row, error } = await c
    .from("project_material_selections")
    .update(updates)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error || !row) return null;
  return toRow(row as Record<string, unknown>);
}

/** Delete a selection. */
export async function deleteSelection(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("project_material_selections").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete selection.");
}
