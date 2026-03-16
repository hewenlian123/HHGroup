/**
 * Project closeout: final punch list, warranty, completion certificate.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type PunchListItem = { item: string; status: "pending" | "done" };

export type CloseoutPunch = {
  id: string;
  project_id: string;
  inspection_date: string | null;
  inspector: string | null;
  notes: string | null;
  contractor_signature: string | null;
  client_signature: string | null;
  items: PunchListItem[];
  created_at: string;
  updated_at: string;
};

export type CloseoutWarranty = {
  id: string;
  project_id: string;
  start_date: string | null;
  period_months: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CloseoutCompletion = {
  id: string;
  project_id: string;
  completion_date: string | null;
  contractor_name: string | null;
  client_name: string | null;
  contractor_signature: string | null;
  client_signature: string | null;
  created_at: string;
  updated_at: string;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

export async function getCloseoutPunch(projectId: string): Promise<CloseoutPunch | null> {
  const c = client();
  const { data: row, error } = await c
    .from("project_closeout_punch")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load punch list.");
  if (!row) return null;
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    project_id: row.project_id,
    inspection_date: row.inspection_date ? String(row.inspection_date).slice(0, 10) : null,
    inspector: row.inspector ?? null,
    notes: row.notes ?? null,
    contractor_signature: row.contractor_signature ?? null,
    client_signature: row.client_signature ?? null,
    items: items.map((x: { item?: string; status?: string }) => ({
      item: x.item ?? "",
      status: x.status === "done" ? "done" : "pending",
    })),
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

export async function upsertCloseoutPunch(
  projectId: string,
  data: Partial<Pick<CloseoutPunch, "inspection_date" | "inspector" | "notes" | "contractor_signature" | "client_signature" | "items">>
): Promise<CloseoutPunch> {
  const c = client();
  const payload = {
    project_id: projectId,
    ...(data.inspection_date !== undefined && { inspection_date: data.inspection_date?.slice(0, 10) ?? null }),
    ...(data.inspector !== undefined && { inspector: data.inspector ?? null }),
    ...(data.notes !== undefined && { notes: data.notes ?? null }),
    ...(data.contractor_signature !== undefined && { contractor_signature: data.contractor_signature ?? null }),
    ...(data.client_signature !== undefined && { client_signature: data.client_signature ?? null }),
    ...(data.items !== undefined && { items: data.items }),
    updated_at: new Date().toISOString(),
  };
  const { data: row, error } = await c
    .from("project_closeout_punch")
    .upsert(payload, { onConflict: "project_id" })
    .select()
    .single();
  if (error) throw new Error(error.message ?? "Failed to save punch list.");
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    project_id: row.project_id,
    inspection_date: row.inspection_date ? String(row.inspection_date).slice(0, 10) : null,
    inspector: row.inspector ?? null,
    notes: row.notes ?? null,
    contractor_signature: row.contractor_signature ?? null,
    client_signature: row.client_signature ?? null,
    items: items.map((x: { item?: string; status?: string }) => ({
      item: x.item ?? "",
      status: x.status === "done" ? "done" : "pending",
    })),
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

export async function getCloseoutWarranty(projectId: string): Promise<CloseoutWarranty | null> {
  const c = client();
  const { data: row, error } = await c
    .from("project_closeout_warranty")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load warranty.");
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : null,
    period_months: Number(row.period_months) || 12,
    notes: row.notes ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

export async function upsertCloseoutWarranty(
  projectId: string,
  data: Partial<Pick<CloseoutWarranty, "start_date" | "period_months" | "notes">>
): Promise<CloseoutWarranty> {
  const c = client();
  const payload = {
    project_id: projectId,
    ...(data.start_date !== undefined && { start_date: data.start_date?.slice(0, 10) ?? null }),
    ...(data.period_months !== undefined && { period_months: data.period_months }),
    ...(data.notes !== undefined && { notes: data.notes ?? null }),
    updated_at: new Date().toISOString(),
  };
  const { data: row, error } = await c
    .from("project_closeout_warranty")
    .upsert(payload, { onConflict: "project_id" })
    .select()
    .single();
  if (error) throw new Error(error.message ?? "Failed to save warranty.");
  return {
    id: row.id,
    project_id: row.project_id,
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : null,
    period_months: Number(row.period_months) || 12,
    notes: row.notes ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

export async function getCloseoutCompletion(projectId: string): Promise<CloseoutCompletion | null> {
  const c = client();
  const { data: row, error } = await c
    .from("project_closeout_completion")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load completion.");
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    completion_date: row.completion_date ? String(row.completion_date).slice(0, 10) : null,
    contractor_name: row.contractor_name ?? null,
    client_name: row.client_name ?? null,
    contractor_signature: row.contractor_signature ?? null,
    client_signature: row.client_signature ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

export async function upsertCloseoutCompletion(
  projectId: string,
  data: Partial<Pick<CloseoutCompletion, "completion_date" | "contractor_name" | "client_name" | "contractor_signature" | "client_signature">>
): Promise<CloseoutCompletion> {
  const c = client();
  const payload = {
    project_id: projectId,
    ...(data.completion_date !== undefined && { completion_date: data.completion_date?.slice(0, 10) ?? null }),
    ...(data.contractor_name !== undefined && { contractor_name: data.contractor_name ?? null }),
    ...(data.client_name !== undefined && { client_name: data.client_name ?? null }),
    ...(data.contractor_signature !== undefined && { contractor_signature: data.contractor_signature ?? null }),
    ...(data.client_signature !== undefined && { client_signature: data.client_signature ?? null }),
    updated_at: new Date().toISOString(),
  };
  const { data: row, error } = await c
    .from("project_closeout_completion")
    .upsert(payload, { onConflict: "project_id" })
    .select()
    .single();
  if (error) throw new Error(error.message ?? "Failed to save completion.");
  return {
    id: row.id,
    project_id: row.project_id,
    completion_date: row.completion_date ? String(row.completion_date).slice(0, 10) : null,
    contractor_name: row.contractor_name ?? null,
    client_name: row.client_name ?? null,
    contractor_signature: row.contractor_signature ?? null,
    client_signature: row.client_signature ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}
