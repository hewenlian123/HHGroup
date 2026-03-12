/**
 * Material catalog — Supabase only. Table: material_catalog.
 */

import { supabase } from "@/lib/supabase";

export type MaterialCatalogRow = {
  id: string;
  category: string;
  material_name: string;
  supplier: string | null;
  cost: number | null;
  photo_url: string | null;
  description: string | null;
  created_at: string;
};

export type MaterialCatalogDraft = {
  category: string;
  material_name: string;
  supplier?: string | null;
  cost?: number | null;
  photo_url?: string | null;
  description?: string | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS = "id, category, material_name, supplier, cost, photo_url, description, created_at";

function toRow(r: Record<string, unknown>): MaterialCatalogRow {
  return {
    id: (r.id as string) ?? "",
    category: (r.category as string) ?? "",
    material_name: (r.material_name as string) ?? "",
    supplier: (r.supplier as string | null) ?? null,
    cost: r.cost != null ? Number(r.cost) : null,
    photo_url: (r.photo_url as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
  };
}

/** Get all materials in the catalog. */
export async function getMaterialCatalog(): Promise<MaterialCatalogRow[]> {
  const c = client();
  const { data, error } = await c
    .from("material_catalog")
    .select(COLS)
    .order("category")
    .order("material_name");
  if (error) throw new Error(error.message ?? "Failed to load material catalog.");
  return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
}

/** Create a material in the catalog. */
export async function createMaterial(draft: MaterialCatalogDraft): Promise<MaterialCatalogRow> {
  const c = client();
  const { data: row, error } = await c
    .from("material_catalog")
    .insert({
      category: draft.category.trim() || "Uncategorized",
      material_name: draft.material_name.trim() || "Unnamed",
      supplier: draft.supplier?.trim() ?? null,
      cost: draft.cost != null ? Number(draft.cost) : null,
      photo_url: draft.photo_url?.trim() ?? null,
      description: draft.description?.trim() ?? null,
    })
    .select(COLS)
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to create material.");
  return toRow(row as Record<string, unknown>);
}

/** Update a material. */
export async function updateMaterial(
  id: string,
  patch: Partial<Pick<MaterialCatalogRow, "category" | "material_name" | "supplier" | "cost" | "photo_url" | "description">>
): Promise<MaterialCatalogRow | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.category !== undefined) updates.category = patch.category.trim();
  if (patch.material_name !== undefined) updates.material_name = patch.material_name.trim();
  if (patch.supplier !== undefined) updates.supplier = patch.supplier?.trim() ?? null;
  if (patch.cost !== undefined) updates.cost = patch.cost != null ? Number(patch.cost) : null;
  if (patch.photo_url !== undefined) updates.photo_url = patch.photo_url?.trim() ?? null;
  if (patch.description !== undefined) updates.description = patch.description?.trim() ?? null;
  if (Object.keys(updates).length === 0) return null;
  const { data: row, error } = await c.from("material_catalog").update(updates).eq("id", id).select(COLS).single();
  if (error || !row) return null;
  return toRow(row as Record<string, unknown>);
}
