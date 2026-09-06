/**
 * Project closeout: final punch list, warranty, completion certificate.
 */

import { getSupabaseClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

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

function client(explicitClient?: SupabaseClient) {
  const c = explicitClient ?? getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

export async function getCloseoutPunch(
  projectId: string,
  explicitClient?: SupabaseClient
): Promise<CloseoutPunch | null> {
  const c = client(explicitClient);
  const { data: row, error } = await c
    .from("final_punch_lists")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load punch list.");
  if (!row) return null;
  const { data: itemRows, error: itemsError } = await c
    .from("final_punch_list_items")
    .select("item, status, position")
    .eq("punch_list_id", row.id)
    .order("position", { ascending: true });
  if (itemsError) throw new Error(itemsError.message ?? "Failed to load punch list items.");
  if (!Array.isArray(itemRows)) throw new Error("Punch list items are unavailable.");
  return {
    id: row.id,
    project_id: row.project_id,
    inspection_date: row.inspection_date ? String(row.inspection_date).slice(0, 10) : null,
    inspector: row.inspector ?? null,
    notes: row.notes ?? null,
    contractor_signature: row.contractor_signature ?? null,
    client_signature: row.client_signature ?? null,
    items: itemRows.map((x: { item?: string; status?: string }) => ({
      item: x.item ?? "",
      status: x.status === "done" ? "done" : "pending",
    })),
    created_at: row.created_at ?? "",
    updated_at: row.created_at ?? "",
  };
}

export async function upsertCloseoutPunch(
  projectId: string,
  data: Partial<
    Pick<
      CloseoutPunch,
      | "inspection_date"
      | "inspector"
      | "notes"
      | "contractor_signature"
      | "client_signature"
      | "items"
    >
  >,
  explicitClient?: SupabaseClient
): Promise<CloseoutPunch> {
  const c = client(explicitClient);
  const { error } = await c.rpc("replace_final_punch_list", {
    p_project_id: projectId,
    p_inspection_date: data.inspection_date?.slice(0, 10) ?? null,
    p_inspector: data.inspector ?? null,
    p_notes: data.notes ?? null,
    p_contractor_signature: data.contractor_signature ?? null,
    p_client_signature: data.client_signature ?? null,
    p_items: data.items ?? [],
  });
  if (error) throw new Error(error.message ?? "Failed to save punch list.");
  const saved = await getCloseoutPunch(projectId, c);
  if (!saved) throw new Error("Saved punch list could not be reloaded.");
  return saved;
}

export async function getCloseoutWarranty(
  projectId: string,
  explicitClient?: SupabaseClient
): Promise<CloseoutWarranty | null> {
  const c = client(explicitClient);
  const { data: row, error } = await c
    .from("warranties")
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
    updated_at: row.created_at ?? "",
  };
}

export async function upsertCloseoutWarranty(
  projectId: string,
  data: Partial<Pick<CloseoutWarranty, "start_date" | "period_months" | "notes">>,
  explicitClient?: SupabaseClient
): Promise<CloseoutWarranty> {
  const c = client(explicitClient);
  const payload = {
    project_id: projectId,
    ...(data.start_date !== undefined && { start_date: data.start_date?.slice(0, 10) ?? null }),
    ...(data.period_months !== undefined && { period_months: data.period_months }),
    ...(data.notes !== undefined && { notes: data.notes ?? null }),
  };
  const { data: row, error } = await c
    .from("warranties")
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
    updated_at: row.created_at ?? "",
  };
}

export async function getCloseoutCompletion(
  projectId: string,
  explicitClient?: SupabaseClient
): Promise<CloseoutCompletion | null> {
  const c = client(explicitClient);
  const { data: row, error } = await c
    .from("completion_certificates")
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
    updated_at: row.created_at ?? "",
  };
}

export async function upsertCloseoutCompletion(
  projectId: string,
  data: Partial<
    Pick<
      CloseoutCompletion,
      | "completion_date"
      | "contractor_name"
      | "client_name"
      | "contractor_signature"
      | "client_signature"
    >
  >,
  explicitClient?: SupabaseClient
): Promise<CloseoutCompletion> {
  const c = client(explicitClient);
  const payload = {
    project_id: projectId,
    ...(data.completion_date !== undefined && {
      completion_date: data.completion_date?.slice(0, 10) ?? null,
    }),
    ...(data.contractor_name !== undefined && { contractor_name: data.contractor_name ?? null }),
    ...(data.client_name !== undefined && { client_name: data.client_name ?? null }),
    ...(data.contractor_signature !== undefined && {
      contractor_signature: data.contractor_signature ?? null,
    }),
    ...(data.client_signature !== undefined && { client_signature: data.client_signature ?? null }),
  };
  const { data: row, error } = await c
    .from("completion_certificates")
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
    updated_at: row.created_at ?? "",
  };
}
