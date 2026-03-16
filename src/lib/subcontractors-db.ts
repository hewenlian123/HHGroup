/**
 * Subcontractors — Supabase only. No mock data.
 * Table: subcontractors.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type SubcontractorRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
  insurance_expiration_date: string | null;
  w9_storage_path: string | null;
  notes: string | null;
};

export type SubcontractorDraft = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  active?: boolean;
  insurance_expiration_date?: string | null;
  w9_storage_path?: string | null;
  notes?: string | null;
};

/** Subcontractor with insurance alert flag (expires within 30 days or already expired). */
export type SubcontractorWithInsuranceAlert = SubcontractorRow & { insurance_alert: boolean };

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|schema cache/i.test(m);
}

const COLS_FULL = "id, name, phone, email, address, active, created_at, insurance_expiration_date, w9_storage_path, notes";
const COLS_BASE = "id, name, phone, email, address, active, created_at";

/** Fetch all subcontractors, ordered by name. */
export async function getSubcontractors(): Promise<SubcontractorRow[]> {
  const c = client();
  const first = await c.from("subcontractors").select(COLS_FULL).order("name");
  if (!first.error) return (first.data ?? []).map((r: Record<string, unknown>) => mapRow(r));
  if (!isMissingColumn(first.error)) throw new Error(first.error.message ?? "Failed to load subcontractors.");
  // Fallback: columns added in a later migration don't exist yet — fetch base columns only.
  const fallback = await c.from("subcontractors").select(COLS_BASE).order("name");
  if (fallback.error) throw new Error(fallback.error.message ?? "Failed to load subcontractors.");
  return (fallback.data ?? []).map((r: Record<string, unknown>) => mapRow(r));
}

function mapRow(r: Record<string, unknown>): SubcontractorRow {
  return {
    id: (r.id as string) ?? "",
    name: (r.name as string) ?? "",
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    active: Boolean(r.active),
    created_at: (r.created_at as string) ?? "",
    insurance_expiration_date: (r.insurance_expiration_date as string | null) ?? null,
    w9_storage_path: (r.w9_storage_path as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

/** Fetch one subcontractor by id. Returns null if not found. */
export async function getSubcontractorById(id: string): Promise<SubcontractorRow | null> {
  const c = client();
  const first = await c.from("subcontractors").select(COLS_FULL).eq("id", id).maybeSingle();
  if (!first.error) return first.data ? mapRow(first.data as Record<string, unknown>) : null;
  if (!isMissingColumn(first.error)) throw new Error(first.error.message ?? "Failed to load subcontractor.");
  const fallback = await c.from("subcontractors").select(COLS_BASE).eq("id", id).maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message ?? "Failed to load subcontractor.");
  return fallback.data ? mapRow(fallback.data as Record<string, unknown>) : null;
}

/** Insert one subcontractor. */
export async function insertSubcontractor(draft: SubcontractorDraft): Promise<void> {
  const c = client();
  const fullPayload = {
    name: draft.name.trim(),
    phone: draft.phone?.trim() || null,
    email: draft.email?.trim() || null,
    address: draft.address?.trim() || null,
    active: draft.active ?? true,
    insurance_expiration_date: draft.insurance_expiration_date?.slice(0, 10) || null,
    w9_storage_path: draft.w9_storage_path?.trim() || null,
    notes: draft.notes?.trim() || null,
  };
  const { error } = await c.from("subcontractors").insert(fullPayload);
  if (!error) return;
  if (!isMissingColumn(error)) throw new Error(error.message ?? "Failed to add subcontractor.");
  // Fallback: insert without newer columns.
  const { name, phone, email, address, active } = fullPayload;
  const { error: err2 } = await c.from("subcontractors").insert({ name, phone, email, address, active });
  if (err2) throw new Error(err2.message ?? "Failed to add subcontractor.");
}

export type UpdateSubcontractorPatch = Partial<
  Pick<SubcontractorRow, "name" | "phone" | "email" | "address" | "active" | "insurance_expiration_date" | "w9_storage_path" | "notes">
>;

/** Update one subcontractor. */
export async function updateSubcontractor(id: string, patch: UpdateSubcontractorPatch): Promise<SubcontractorRow | null> {
  const c = client();
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.phone !== undefined) payload.phone = patch.phone?.trim() || null;
  if (patch.email !== undefined) payload.email = patch.email?.trim() || null;
  if (patch.address !== undefined) payload.address = patch.address?.trim() || null;
  if (patch.active !== undefined) payload.active = patch.active;
  if (patch.insurance_expiration_date !== undefined) payload.insurance_expiration_date = patch.insurance_expiration_date?.slice(0, 10) || null;
  if (patch.w9_storage_path !== undefined) payload.w9_storage_path = patch.w9_storage_path?.trim() || null;
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
  if (Object.keys(payload).length === 0) return getSubcontractorById(id);
  const { error } = await c.from("subcontractors").update(payload).eq("id", id);
  if (error) {
    if (!isMissingColumn(error)) throw new Error(error.message ?? "Failed to update subcontractor.");
    // Retry without newer columns.
    const basePayload: Record<string, unknown> = {};
    if (payload.name !== undefined) basePayload.name = payload.name;
    if (payload.phone !== undefined) basePayload.phone = payload.phone;
    if (payload.email !== undefined) basePayload.email = payload.email;
    if (payload.address !== undefined) basePayload.address = payload.address;
    if (payload.active !== undefined) basePayload.active = payload.active;
    if (Object.keys(basePayload).length > 0) {
      const { error: err2 } = await c.from("subcontractors").update(basePayload).eq("id", id);
      if (err2) throw new Error(err2.message ?? "Failed to update subcontractor.");
    }
  }
  return getSubcontractorById(id);
}

export async function deleteSubcontractor(id: string): Promise<void> {
  const c = client();
  // Block deletion when there are related subcontracts.
  const { count, error: countErr } = await c
    .from("subcontracts")
    .select("id", { count: "exact", head: true })
    .eq("subcontractor_id", id);
  if (countErr) throw new Error(countErr.message ?? "Failed to check subcontract usage.");
  if ((count ?? 0) > 0) throw new Error("Cannot delete subcontractor with existing contracts.");

  const { error } = await c.from("subcontractors").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete subcontractor.");
}

const INSURANCE_ALERT_DAYS = 30;

/** Fetch all subcontractors with insurance_alert true when expiration is within 30 days or past. */
export async function getSubcontractorsWithInsuranceAlerts(): Promise<SubcontractorWithInsuranceAlert[]> {
  const list = await getSubcontractors();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + INSURANCE_ALERT_DAYS);
  return list.map((row) => {
    const exp = row.insurance_expiration_date ? new Date(row.insurance_expiration_date) : null;
    const insurance_alert = !!exp && exp.getTime() <= cutoff.getTime();
    return { ...row, insurance_alert };
  });
}
