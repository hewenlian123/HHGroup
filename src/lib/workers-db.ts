/**
 * Workers — Supabase only. Table: workers.
 *
 * Column fallback: tries extended columns (trade, daily_rate, default_ot_rate) first.
 * Falls back to the original labor schema (role, half_day_rate) if those columns don't
 * exist yet (i.e. before migration 202603182000_workers_add_trade_rates.sql is applied).
 */

import { getSupabaseClient } from "@/lib/supabase";

export type WorkerStatus = "Active" | "Inactive";

export type WorkerRow = {
  id: string;
  name: string;
  phone: string | null;
  trade: string | null;
  daily_rate: number;
  default_ot_rate: number;
  status: WorkerStatus;
  notes: string | null;
  created_at: string;
};

export type WorkerDraft = {
  name: string;
  phone?: string | null;
  trade?: string | null;
  daily_rate?: number;
  default_ot_rate?: number;
  status?: WorkerStatus;
  notes?: string | null;
};

/** Extended columns (new schema — after 202603182000 migration). */
const COLS_EXT = "id, name, phone, trade, daily_rate, default_ot_rate, status, notes, created_at";
/** Base columns (original labor schema — always present). */
const COLS_BASE = "id, name, phone, role, half_day_rate, status, notes, created_at";

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column.*does not exist|does not exist.*column|undefined column|could not find.*column|schema cache/i.test(
    m
  );
}

/** Map an extended-schema row. */
function mapExtRow(r: Record<string, unknown>): WorkerRow {
  return {
    id: (r.id as string) ?? "",
    name: (r.name as string) ?? "",
    phone: (r.phone as string | null) ?? null,
    trade: (r.trade as string | null) ?? null,
    daily_rate: Number(r.daily_rate) || 0,
    default_ot_rate: Number(r.default_ot_rate) || 0,
    status: (r.status === "Active" || r.status === "Inactive"
      ? r.status
      : r.status === "active"
        ? "Active"
        : "Inactive") as WorkerStatus,
    notes: (r.notes as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
  };
}

/** Map a base-schema (role/half_day_rate) row to WorkerRow. */
function mapBaseRow(r: Record<string, unknown>): WorkerRow {
  return {
    id: (r.id as string) ?? "",
    name: (r.name as string) ?? "",
    phone: (r.phone as string | null) ?? null,
    trade: (r.role as string | null) ?? null,
    daily_rate: Number(r.half_day_rate) || 0,
    default_ot_rate: 0,
    status: (r.status === "Active" || r.status === "Inactive"
      ? r.status
      : r.status === "active"
        ? "Active"
        : "Inactive") as WorkerStatus,
    notes: (r.notes as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
  };
}

/** Fetch all workers, ordered by name. */
export async function getWorkers(): Promise<WorkerRow[]> {
  const c = client();
  const { data: rows, error } = await c.from("workers").select(COLS_EXT).order("name");
  if (error) {
    if (isMissingTable(error)) return [];
    if (isMissingColumn(error)) {
      // fall back to old schema
      const { data: rows2, error: err2 } = await c.from("workers").select(COLS_BASE).order("name");
      if (err2) {
        if (isMissingTable(err2)) return [];
        throw new Error(err2.message ?? "Failed to load workers.");
      }
      return (rows2 ?? []).map((r: Record<string, unknown>) => mapBaseRow(r));
    }
    throw new Error(error.message ?? "Failed to load workers.");
  }
  return (rows ?? []).map((r: Record<string, unknown>) => mapExtRow(r));
}

/** Fetch one worker by id. Returns null if not found. */
export async function getWorkerById(id: string): Promise<WorkerRow | null> {
  const c = client();
  const { data: row, error } = await c.from("workers").select(COLS_EXT).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    if (isMissingColumn(error)) {
      const { data: row2, error: err2 } = await c
        .from("workers")
        .select(COLS_BASE)
        .eq("id", id)
        .maybeSingle();
      if (err2 || !row2) return null;
      return mapBaseRow(row2 as Record<string, unknown>);
    }
    throw new Error(error.message ?? "Failed to load worker.");
  }
  return row ? mapExtRow(row as Record<string, unknown>) : null;
}

/** Insert one worker. */
export async function insertWorker(draft: WorkerDraft): Promise<WorkerRow> {
  const c = client();
  const name = draft.name?.trim();
  if (!name) throw new Error("Name is required.");

  // Try extended schema first
  const extPayload = {
    name,
    phone: draft.phone?.trim() || null,
    trade: draft.trade?.trim() || null,
    daily_rate: Number(draft.daily_rate) || 0,
    default_ot_rate: Number(draft.default_ot_rate) || 0,
    status: draft.status === "Inactive" ? "Inactive" : "Active",
    notes: draft.notes?.trim() || null,
  };
  const { data: row, error } = await c.from("workers").insert(extPayload).select(COLS_EXT).single();
  if (error) {
    if (isMissingColumn(error)) {
      // fall back to base schema
      const basePayload = {
        name,
        phone: draft.phone?.trim() || null,
        role: draft.trade?.trim() || null,
        half_day_rate: Number(draft.daily_rate) || 0,
        status: draft.status === "Inactive" ? "inactive" : "active",
        notes: draft.notes?.trim() || null,
      };
      const { data: row2, error: err2 } = await c
        .from("workers")
        .insert(basePayload)
        .select(COLS_BASE)
        .single();
      if (err2) throw new Error(err2.message ?? "Failed to add worker.");
      return mapBaseRow(row2 as Record<string, unknown>);
    }
    throw new Error(error.message ?? "Failed to add worker.");
  }
  return mapExtRow(row as Record<string, unknown>);
}

export type UpdateWorkerPatch = Partial<
  Pick<
    WorkerRow,
    "name" | "phone" | "trade" | "daily_rate" | "default_ot_rate" | "status" | "notes"
  >
>;

/** Update one worker. */
export async function updateWorker(
  id: string,
  patch: UpdateWorkerPatch
): Promise<WorkerRow | null> {
  const c = client();
  const extPayload: Record<string, unknown> = {};
  if (patch.name !== undefined) extPayload.name = patch.name.trim();
  if (patch.phone !== undefined) extPayload.phone = patch.phone?.trim() || null;
  if (patch.trade !== undefined) extPayload.trade = patch.trade?.trim() || null;
  if (patch.daily_rate !== undefined) extPayload.daily_rate = Number(patch.daily_rate) || 0;
  if (patch.default_ot_rate !== undefined)
    extPayload.default_ot_rate = Number(patch.default_ot_rate) || 0;
  if (patch.status !== undefined)
    extPayload.status = patch.status === "Inactive" ? "Inactive" : "Active";
  if (patch.notes !== undefined) extPayload.notes = patch.notes?.trim() || null;

  if (Object.keys(extPayload).length === 0) return getWorkerById(id);

  const { data: row, error } = await c
    .from("workers")
    .update(extPayload)
    .eq("id", id)
    .select(COLS_EXT)
    .single();
  if (error) {
    if (isMissingColumn(error)) {
      // fall back to base schema
      const basePayload: Record<string, unknown> = {};
      if (patch.name !== undefined) basePayload.name = patch.name.trim();
      if (patch.phone !== undefined) basePayload.phone = patch.phone?.trim() || null;
      if (patch.trade !== undefined) basePayload.role = patch.trade?.trim() || null;
      if (patch.daily_rate !== undefined) basePayload.half_day_rate = Number(patch.daily_rate) || 0;
      if (patch.status !== undefined)
        basePayload.status = patch.status === "Inactive" ? "inactive" : "active";
      if (patch.notes !== undefined) basePayload.notes = patch.notes?.trim() || null;

      if (Object.keys(basePayload).length === 0) return getWorkerById(id);
      const { data: row2, error: err2 } = await c
        .from("workers")
        .update(basePayload)
        .eq("id", id)
        .select(COLS_BASE)
        .single();
      if (err2) throw new Error(err2.message ?? "Failed to update worker.");
      return row2 ? mapBaseRow(row2 as Record<string, unknown>) : null;
    }
    throw new Error(error.message ?? "Failed to update worker.");
  }
  return row ? mapExtRow(row as Record<string, unknown>) : null;
}

/** Delete one worker. */
export async function deleteWorker(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("workers").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete worker.");
}
