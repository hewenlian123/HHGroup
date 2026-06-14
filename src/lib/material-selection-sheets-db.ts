import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import type {
  MaterialSelectionItem,
  MaterialSelectionItemDraft,
  MaterialSelectionItemStatus,
  MaterialSelectionSheet,
  MaterialSelectionSheetDraft,
  MaterialSelectionSheetStatus,
  MaterialSelectionSheetWithItems,
} from "@/lib/material-selection-sheets";

const SHEET_COLS =
  "id, selection_number, customer_id, project_id, title, status, notes, created_at, updated_at";
const SHEET_COLS_WITH_NAMES = `${SHEET_COLS}, customers(name), projects(name)`;
const ITEM_COLS =
  "id, selection_id, area_name, category, item_name, brand, sku, size, color, finish, image_url, notes, status, sort_order, created_at, updated_at";

function client(explicitClient?: SupabaseClient): SupabaseClient {
  const c = explicitClient ?? getServerSupabaseInternalNoStore();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function nonEmptyText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function normalizeSheetStatus(value: unknown): MaterialSelectionSheetStatus {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "shared" || raw === "approved") return raw;
  return "draft";
}

function normalizeItemStatus(value: unknown): MaterialSelectionItemStatus {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "approved" || raw === "installed") return raw;
  return "selected";
}

function joinedName(value: unknown): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  return nonEmptyText((row as { name?: unknown }).name);
}

function toSheet(row: Record<string, unknown>): MaterialSelectionSheet {
  return {
    id: String(row.id ?? ""),
    selectionNumber: String(row.selection_number ?? ""),
    customerId: nonEmptyText(row.customer_id),
    customerName: joinedName(row.customers),
    projectId: nonEmptyText(row.project_id),
    projectName: joinedName(row.projects),
    title: String(row.title ?? ""),
    status: normalizeSheetStatus(row.status),
    notes: nonEmptyText(row.notes),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function toItem(row: Record<string, unknown>): MaterialSelectionItem {
  return {
    id: String(row.id ?? ""),
    selectionId: String(row.selection_id ?? ""),
    areaName: nonEmptyText(row.area_name),
    category: nonEmptyText(row.category),
    itemName: String(row.item_name ?? ""),
    brand: nonEmptyText(row.brand),
    sku: nonEmptyText(row.sku),
    size: nonEmptyText(row.size),
    color: nonEmptyText(row.color),
    finish: nonEmptyText(row.finish),
    imageUrl: nonEmptyText(row.image_url),
    notes: nonEmptyText(row.notes),
    status: normalizeItemStatus(row.status),
    sortOrder: Number(row.sort_order ?? 0) || 0,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function generateSelectionNumber(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `MS-${stamp}-${suffix}`;
}

export async function listMaterialSelectionSheets(
  explicitClient?: SupabaseClient
): Promise<MaterialSelectionSheet[]> {
  const c = client(explicitClient);
  const { data, error } = await c
    .from("material_selections")
    .select(SHEET_COLS_WITH_NAMES)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load material selections.");
  return (data ?? []).map((row) => toSheet(row as Record<string, unknown>));
}

export async function getMaterialSelectionSheet(
  id: string,
  explicitClient?: SupabaseClient
): Promise<MaterialSelectionSheetWithItems | null> {
  const c = client(explicitClient);
  const { data: sheetRow, error: sheetError } = await c
    .from("material_selections")
    .select(SHEET_COLS_WITH_NAMES)
    .eq("id", id)
    .maybeSingle();
  if (sheetError) throw new Error(sheetError.message ?? "Failed to load material selection.");
  if (!sheetRow) return null;

  const { data: itemRows, error: itemError } = await c
    .from("material_selection_items")
    .select(ITEM_COLS)
    .eq("selection_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemError) throw new Error(itemError.message ?? "Failed to load material items.");

  return {
    ...toSheet(sheetRow as Record<string, unknown>),
    items: (itemRows ?? []).map((row) => toItem(row as Record<string, unknown>)),
  };
}

export async function createMaterialSelectionSheet(
  draft: MaterialSelectionSheetDraft,
  explicitClient?: SupabaseClient
): Promise<MaterialSelectionSheet> {
  const c = client(explicitClient);
  const title = draft.title.trim();
  if (!title) throw new Error("Title is required.");

  const payload = {
    selection_number: generateSelectionNumber(),
    title,
    customer_id: nonEmptyText(draft.customerId),
    project_id: nonEmptyText(draft.projectId),
    status: draft.status ?? "draft",
    notes: nonEmptyText(draft.notes),
  };

  const { data, error } = await c
    .from("material_selections")
    .insert(payload)
    .select(SHEET_COLS_WITH_NAMES)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create material selection.");
  return toSheet(data as Record<string, unknown>);
}

export async function addMaterialSelectionItem(
  selectionId: string,
  draft: MaterialSelectionItemDraft,
  explicitClient?: SupabaseClient
): Promise<MaterialSelectionItem> {
  const c = client(explicitClient);
  const itemName = draft.itemName.trim();
  if (!itemName) throw new Error("Material name is required.");

  const { count, error: countError } = await c
    .from("material_selection_items")
    .select("id", { count: "exact", head: true })
    .eq("selection_id", selectionId);
  if (countError) throw new Error(countError.message ?? "Failed to count material items.");

  const payload = {
    selection_id: selectionId,
    area_name: nonEmptyText(draft.areaName),
    category: nonEmptyText(draft.category),
    item_name: itemName,
    brand: nonEmptyText(draft.brand),
    sku: nonEmptyText(draft.sku),
    size: nonEmptyText(draft.size),
    color: nonEmptyText(draft.color),
    finish: nonEmptyText(draft.finish),
    image_url: nonEmptyText(draft.imageUrl),
    notes: nonEmptyText(draft.notes),
    status: draft.status ?? "selected",
    sort_order: count ?? 0,
  };

  const { data, error } = await c
    .from("material_selection_items")
    .insert(payload)
    .select(ITEM_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to add material item.");

  await c
    .from("material_selections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", selectionId);

  return toItem(data as Record<string, unknown>);
}

export async function deleteMaterialSelectionSheet(
  id: string,
  explicitClient?: SupabaseClient
): Promise<void> {
  const c = client(explicitClient);
  const selectionId = id.trim();
  if (!selectionId) throw new Error("Material selection id is required.");

  const { data, error } = await c
    .from("material_selections")
    .delete()
    .eq("id", selectionId)
    .select("id");

  if (error) throw new Error(error.message ?? "Failed to delete material selection.");
  if ((data ?? []).length === 0) throw new Error("Material selection was not found.");
}
