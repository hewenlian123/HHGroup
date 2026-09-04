/**
 * Workers — Supabase only. Table: workers.
 *
 * Column fallback: tries extended columns (trade, daily_rate, default_ot_rate) first.
 * Falls back to the original labor schema (role, half_day_rate) if those columns don't
 * exist yet (i.e. before migration 202603182000_workers_add_trade_rates.sql is applied).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import {
  changeWorkerDailyRateWithClient,
  ensureInitialWorkerRateHistoryWithClient,
} from "@/lib/worker-rate-history-db";

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
/** Extended columns when a remote has trade/daily_rate but not default_ot_rate. */
const COLS_EXT_NO_OT = "id, name, phone, trade, daily_rate, status, notes, created_at";
/** Hybrid columns when a remote has legacy workers plus daily_rate repair. */
const COLS_BASE_DAILY =
  "id, name, phone, role, half_day_rate, daily_rate, status, notes, created_at";
/** Base columns (original labor schema — always present). */
const COLS_BASE = "id, name, phone, role, half_day_rate, status, notes, created_at";
/** Minimal columns when role/half_day_rate are absent (sparse remotes). */
const COLS_MIN = "id, name, phone, status, notes, created_at";

function client(explicitClient?: SupabaseClient) {
  const c = explicitClient ?? getSupabaseClient();
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

function isStatusConstraintError(err: { code?: string; message?: string } | null): boolean {
  const m = err?.message ?? "";
  return (
    err?.code === "23514" ||
    /workers_status_check|check constraint.*status|violates check constraint/i.test(m)
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

function mapMinRow(r: Record<string, unknown>): WorkerRow {
  const row = mapBaseRow({
    ...r,
    role: null,
    half_day_rate: 0,
  });
  return { ...row, trade: null, daily_rate: 0, default_ot_rate: 0 };
}

function mapWorkerRow(r: Record<string, unknown>): WorkerRow {
  const hasDailyRate = Object.prototype.hasOwnProperty.call(r, "daily_rate");
  const dailyRateSource = hasDailyRate ? r.daily_rate : r.half_day_rate;
  return {
    id: (r.id as string) ?? "",
    name: (r.name as string) ?? "",
    phone: (r.phone as string | null) ?? null,
    trade: ((r.trade ?? r.role) as string | null) ?? null,
    daily_rate: Number(dailyRateSource) || 0,
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

/** Fetch all workers, ordered by name without schema-probe requests. */
export async function getWorkers(explicitClient?: SupabaseClient): Promise<WorkerRow[]> {
  const c = client(explicitClient);
  const byName = (a: WorkerRow, b: WorkerRow) => a.name.localeCompare(b.name);
  const { data: rows, error } = await c.from("workers").select("*");
  if (error) throw new Error(error.message ?? "Failed to load workers.");
  if (!Array.isArray(rows)) throw new Error("Workers are unavailable.");
  return rows.map((r: Record<string, unknown>) => mapWorkerRow(r)).sort(byName);
}

/** Fetch one worker by id. Returns null if not found. */
export async function getWorkerById(
  id: string,
  explicitClient?: SupabaseClient
): Promise<WorkerRow | null> {
  const c = client(explicitClient);
  const { data: row, error } = await c.from("workers").select(COLS_EXT).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    if (isMissingColumn(error)) {
      const { data: row2, error: err2 } = await c
        .from("workers")
        .select(COLS_BASE)
        .eq("id", id)
        .maybeSingle();
      if (!err2) return row2 ? mapBaseRow(row2 as Record<string, unknown>) : null;
      if (isMissingTable(err2)) return null;
      if (!isMissingColumn(err2)) return null;
      const { data: row3, error: err3 } = await c
        .from("workers")
        .select(COLS_MIN)
        .eq("id", id)
        .maybeSingle();
      if (err3 || !row3) return null;
      return mapMinRow(row3 as Record<string, unknown>);
    }
    throw new Error(error.message ?? "Failed to load worker.");
  }
  return row ? mapExtRow(row as Record<string, unknown>) : null;
}

/** Insert one worker. */
export async function insertWorker(
  draft: WorkerDraft,
  explicitClient?: SupabaseClient
): Promise<WorkerRow> {
  const c = client(explicitClient);
  const name = draft.name?.trim();
  if (!name) throw new Error("Name is required.");

  const phone = draft.phone?.trim() || null;
  const trade = draft.trade?.trim() || null;
  const dailyRate = Number(draft.daily_rate) || 0;
  const defaultOtRate = Number(draft.default_ot_rate) || 0;
  const notes = draft.notes?.trim() || null;
  const statusVariants =
    draft.status === "Inactive" ? ["Inactive", "inactive"] : ["Active", "active"];
  const variants: Array<{
    payload: Record<string, unknown>;
    select: string;
    map: (row: Record<string, unknown>) => WorkerRow;
  }> = [
    {
      payload: { name, phone, trade, daily_rate: dailyRate, default_ot_rate: defaultOtRate, notes },
      select: COLS_EXT,
      map: mapExtRow,
    },
    {
      payload: { name, phone, trade, daily_rate: dailyRate, notes },
      select: COLS_EXT_NO_OT,
      map: mapExtRow,
    },
    {
      payload: { name, phone, role: trade, half_day_rate: dailyRate, daily_rate: dailyRate, notes },
      select: COLS_BASE_DAILY,
      map: mapBaseRow,
    },
    {
      payload: { name, phone, role: trade, half_day_rate: dailyRate, notes },
      select: COLS_BASE,
      map: mapBaseRow,
    },
    {
      payload: { name, phone, notes },
      select: COLS_MIN,
      map: mapMinRow,
    },
  ];

  let lastError: { code?: string; message?: string } | null = null;
  let row: WorkerRow | null = null;
  for (const variant of variants) {
    let variantNeedsSchemaFallback = false;
    for (const status of statusVariants) {
      const { data, error } = await c
        .from("workers")
        .insert({ ...variant.payload, status })
        .select(variant.select)
        .single();
      if (!error) {
        row = variant.map(data as unknown as Record<string, unknown>);
        break;
      }
      lastError = error;
      if (isMissingColumn(error)) {
        variantNeedsSchemaFallback = true;
        break;
      }
      if (!isStatusConstraintError(error)) {
        throw new Error(error.message ?? "Failed to add worker.");
      }
    }
    if (row) break;
    if (!variantNeedsSchemaFallback && lastError && !isMissingColumn(lastError)) {
      throw new Error(lastError.message ?? "Failed to add worker.");
    }
  }
  if (!row) throw new Error(lastError?.message ?? "Failed to add worker.");

  await ensureInitialWorkerRateHistoryWithClient(c, {
    workerId: row.id,
    dailyRate: draft.daily_rate,
    effectiveFrom: (row.created_at ?? "").slice(0, 10),
  }).catch((error) => {
    console.warn(
      "[workers] Worker created, but initial daily rate history could not be initialized.",
      error
    );
  });
  return row;
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
  patch: UpdateWorkerPatch,
  explicitClient?: SupabaseClient
): Promise<WorkerRow | null> {
  const c = client(explicitClient);
  const dailyRatePatch = patch.daily_rate;
  const extPayload: Record<string, unknown> = {};
  if (patch.name !== undefined) extPayload.name = patch.name.trim();
  if (patch.phone !== undefined) extPayload.phone = patch.phone?.trim() || null;
  if (patch.trade !== undefined) extPayload.trade = patch.trade?.trim() || null;
  if (patch.default_ot_rate !== undefined)
    extPayload.default_ot_rate = Number(patch.default_ot_rate) || 0;
  if (patch.status !== undefined)
    extPayload.status = patch.status === "Inactive" ? "Inactive" : "Active";
  if (patch.notes !== undefined) extPayload.notes = patch.notes?.trim() || null;

  if (Object.keys(extPayload).length === 0) {
    if (dailyRatePatch !== undefined) {
      await changeWorkerDailyRateWithClient(c, id, {
        dailyRate: dailyRatePatch,
        effectiveFrom: new Date().toISOString().slice(0, 10),
        notes: "Updated from Workers list",
      });
    }
    return getWorkerById(id, c);
  }

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
      if (patch.status !== undefined)
        basePayload.status = patch.status === "Inactive" ? "inactive" : "active";
      if (patch.notes !== undefined) basePayload.notes = patch.notes?.trim() || null;

      if (Object.keys(basePayload).length === 0) {
        if (dailyRatePatch !== undefined) {
          await changeWorkerDailyRateWithClient(c, id, {
            dailyRate: dailyRatePatch,
            effectiveFrom: new Date().toISOString().slice(0, 10),
            notes: "Updated from Workers list",
          });
        }
        return getWorkerById(id, c);
      }
      const { data: row2, error: err2 } = await c
        .from("workers")
        .update(basePayload)
        .eq("id", id)
        .select(COLS_BASE)
        .single();
      if (err2) throw new Error(err2.message ?? "Failed to update worker.");
      if (dailyRatePatch !== undefined) {
        await changeWorkerDailyRateWithClient(c, id, {
          dailyRate: dailyRatePatch,
          effectiveFrom: new Date().toISOString().slice(0, 10),
          notes: "Updated from Workers list",
        });
      }
      return row2 ? mapBaseRow(row2 as Record<string, unknown>) : null;
    }
    throw new Error(error.message ?? "Failed to update worker.");
  }
  if (dailyRatePatch !== undefined) {
    await changeWorkerDailyRateWithClient(c, id, {
      dailyRate: dailyRatePatch,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      notes: "Updated from Workers list",
    });
    return getWorkerById(id, c);
  }
  return row ? mapExtRow(row as Record<string, unknown>) : null;
}

/** Delete one worker. */
export async function deleteWorker(id: string, explicitClient?: SupabaseClient): Promise<void> {
  const c = client(explicitClient);
  const { error } = await c.from("workers").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete worker.");
}
