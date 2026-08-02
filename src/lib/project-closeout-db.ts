/**
 * Canonical Project Closeout data access.
 *
 * Every operation requires an explicit request-scoped client. Mutations are intended
 * for the authorized server service client; browser callers cannot obtain that client.
 */

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

export type CloseoutDatabaseErrorKind = "conflict" | "not_found" | "validation" | "unexpected";

export class CloseoutDatabaseError extends Error {
  constructor(public readonly kind: CloseoutDatabaseErrorKind) {
    super("Project Closeout database operation failed.");
    this.name = "CloseoutDatabaseError";
  }
}

function errorKind(error: { code?: string } | null): CloseoutDatabaseErrorKind {
  if (["55P03", "57014", "40001", "40P01"].includes(error?.code ?? "")) return "conflict";
  if (error?.code === "P0002") return "not_found";
  if (error?.code === "22023") return "validation";
  return "unexpected";
}

function dateOnly(value: unknown): string | null {
  return value ? String(value).slice(0, 10) : null;
}

function punchFromRows(
  row: Record<string, unknown>,
  itemRows: Array<Record<string, unknown>>
): CloseoutPunch {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    inspection_date: dateOnly(row.inspection_date),
    inspector: typeof row.inspector === "string" ? row.inspector : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    contractor_signature:
      typeof row.contractor_signature === "string" ? row.contractor_signature : null,
    client_signature: typeof row.client_signature === "string" ? row.client_signature : null,
    items: itemRows.map((item) => ({
      item: typeof item.item === "string" ? item.item : "",
      status: item.status === "done" ? "done" : "pending",
    })),
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    // The canonical parent predates updated_at. Preserve the public UI shape without
    // inventing a second timestamp source.
    updated_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function getCloseoutPunch(
  projectId: string,
  explicitClient: SupabaseClient
): Promise<CloseoutPunch | null> {
  const { data: parent, error: parentError } = await explicitClient
    .from("final_punch_lists")
    .select(
      "id, project_id, inspection_date, inspector, notes, contractor_signature, client_signature, created_at"
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (parentError) throw new CloseoutDatabaseError(errorKind(parentError));
  if (!parent) return null;

  const { data: items, error: itemsError } = await explicitClient
    .from("final_punch_list_items")
    .select("id, punch_list_id, item, status, position")
    .eq("punch_list_id", parent.id)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  if (itemsError) throw new CloseoutDatabaseError(errorKind(itemsError));

  return punchFromRows(
    parent as Record<string, unknown>,
    (items ?? []) as Array<Record<string, unknown>>
  );
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
  explicitClient: SupabaseClient
): Promise<CloseoutPunch> {
  const { error } = await explicitClient.rpc("replace_final_punch_list", {
    p_project_id: projectId,
    p_inspection_date: data.inspection_date ?? null,
    p_inspector: data.inspector ?? null,
    p_notes: data.notes ?? null,
    p_contractor_signature: data.contractor_signature ?? null,
    p_client_signature: data.client_signature ?? null,
    p_items: data.items ?? [],
  });
  if (error) throw new CloseoutDatabaseError(errorKind(error));

  const result = await getCloseoutPunch(projectId, explicitClient);
  if (!result) throw new CloseoutDatabaseError("unexpected");
  return result;
}

export async function getCloseoutWarranty(
  projectId: string,
  explicitClient: SupabaseClient
): Promise<CloseoutWarranty | null> {
  const { data: row, error } = await explicitClient
    .from("warranties")
    .select("id, project_id, start_date, period_months, notes, created_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new CloseoutDatabaseError(errorKind(error));
  if (!row) return null;
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    start_date: dateOnly(row.start_date),
    period_months: Number(row.period_months) || 12,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function upsertCloseoutWarranty(
  projectId: string,
  data: Partial<Pick<CloseoutWarranty, "start_date" | "period_months" | "notes">>,
  explicitClient: SupabaseClient
): Promise<CloseoutWarranty> {
  const payload = {
    project_id: projectId,
    start_date: data.start_date ?? null,
    period_months: data.period_months ?? 12,
    notes: data.notes ?? null,
  };
  const { data: row, error } = await explicitClient
    .from("warranties")
    .upsert(payload, { onConflict: "project_id" })
    .select("id, project_id, start_date, period_months, notes, created_at")
    .single();
  if (error || !row) throw new CloseoutDatabaseError(errorKind(error));
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    start_date: dateOnly(row.start_date),
    period_months: Number(row.period_months) || 12,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function getCloseoutCompletion(
  projectId: string,
  explicitClient: SupabaseClient
): Promise<CloseoutCompletion | null> {
  const { data: row, error } = await explicitClient
    .from("completion_certificates")
    .select(
      "id, project_id, completion_date, contractor_name, client_name, contractor_signature, client_signature, created_at"
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new CloseoutDatabaseError(errorKind(error));
  if (!row) return null;
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    completion_date: dateOnly(row.completion_date),
    contractor_name: typeof row.contractor_name === "string" ? row.contractor_name : null,
    client_name: typeof row.client_name === "string" ? row.client_name : null,
    contractor_signature:
      typeof row.contractor_signature === "string" ? row.contractor_signature : null,
    client_signature: typeof row.client_signature === "string" ? row.client_signature : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.created_at === "string" ? row.created_at : "",
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
  explicitClient: SupabaseClient
): Promise<CloseoutCompletion> {
  const payload = {
    project_id: projectId,
    completion_date: data.completion_date ?? null,
    contractor_name: data.contractor_name ?? null,
    client_name: data.client_name ?? null,
    contractor_signature: data.contractor_signature ?? null,
    client_signature: data.client_signature ?? null,
  };
  const { data: row, error } = await explicitClient
    .from("completion_certificates")
    .upsert(payload, { onConflict: "project_id" })
    .select(
      "id, project_id, completion_date, contractor_name, client_name, contractor_signature, client_signature, created_at"
    )
    .single();
  if (error || !row) throw new CloseoutDatabaseError(errorKind(error));
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    completion_date: dateOnly(row.completion_date),
    contractor_name: typeof row.contractor_name === "string" ? row.contractor_name : null,
    client_name: typeof row.client_name === "string" ? row.client_name : null,
    contractor_signature:
      typeof row.contractor_signature === "string" ? row.contractor_signature : null,
    client_signature: typeof row.client_signature === "string" ? row.client_signature : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}
