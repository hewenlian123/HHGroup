/**
 * Subcontracts — Supabase only. No mock data.
 * Table: subcontracts (project_id, subcontractor_id, cost_code, contract_amount, etc.).
 */

import { getSupabaseClient } from "@/lib/supabase";

export type SubcontractRow = {
  id: string;
  project_id: string;
  subcontractor_id: string;
  cost_code: string | null;
  contract_amount: number;
  status: "Draft" | "Active" | "Completed" | "Cancelled";
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export type SubcontractWithSubcontractor = SubcontractRow & {
  subcontractor_name: string;
};

export type SubcontractDraft = {
  project_id: string;
  subcontractor_id: string;
  cost_code?: string | null;
  contract_amount: number;
  status?: SubcontractRow["status"];
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|does not exist.*column|undefined column/i.test(m);
}

/** Fetch one subcontract by id with subcontractor name. Returns null if not found. */
export async function getSubcontractById(subcontractId: string): Promise<SubcontractWithSubcontractor | null> {
  const c = client();
  const selectCols = "id, project_id, subcontractor_id, cost_code, contract_amount, status, description, start_date, end_date, created_at, subcontractors(name)";
  const withoutStatusCols = "id, project_id, subcontractor_id, cost_code, contract_amount, description, start_date, end_date, created_at, subcontractors(name)";

  const { data: row, error } = await c
    .from("subcontracts")
    .select(selectCols)
    .eq("id", subcontractId)
    .maybeSingle();
  if (error && isMissingColumn(error)) {
    const retry = await c.from("subcontracts").select(withoutStatusCols).eq("id", subcontractId).maybeSingle();
    if (retry.error) throw new Error(retry.error.message ?? "Failed to load subcontract.");
    if (!retry.data) return null;
    const r = retry.data as Record<string, unknown>;
    const sub = r.subcontractors as { name?: string } | null;
    return {
      id: (r.id as string) ?? "",
      project_id: (r.project_id as string) ?? "",
      subcontractor_id: (r.subcontractor_id as string) ?? "",
      cost_code: (r.cost_code as string | null) ?? null,
      contract_amount: Number(r.contract_amount) || 0,
      status: "Draft",
      description: (r.description as string | null) ?? null,
      start_date: (r.start_date as string | null)?.slice(0, 10) ?? null,
      end_date: (r.end_date as string | null)?.slice(0, 10) ?? null,
      created_at: (r.created_at as string) ?? "",
      subcontractor_name: sub?.name ?? "—",
    };
  }
  if (error) throw new Error(error.message ?? "Failed to load subcontract.");
  if (!row) return null;
  const r = row as Record<string, unknown>;
  const sub = r.subcontractors as { name?: string } | null;
  return {
    id: (r.id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    subcontractor_id: (r.subcontractor_id as string) ?? "",
    cost_code: (r.cost_code as string | null) ?? null,
    contract_amount: Number(r.contract_amount) || 0,
    status: ((r.status as string) ?? "Draft") as SubcontractRow["status"],
    description: (r.description as string | null) ?? null,
    start_date: (r.start_date as string | null)?.slice(0, 10) ?? null,
    end_date: (r.end_date as string | null)?.slice(0, 10) ?? null,
    created_at: (r.created_at as string) ?? "",
    subcontractor_name: sub?.name ?? "—",
  };
}

/** Fetch subcontracts for a project with subcontractor name. */
export async function getSubcontractsByProject(projectId: string): Promise<SubcontractWithSubcontractor[]> {
  const c = client();
  const selectCols = "id, project_id, subcontractor_id, cost_code, contract_amount, status, description, start_date, end_date, created_at, subcontractors(name)";
  const withoutStatusCols = "id, project_id, subcontractor_id, cost_code, contract_amount, description, start_date, end_date, created_at, subcontractors(name)";

  const { data: rows, error } = await c
    .from("subcontracts")
    .select(selectCols)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error && isMissingColumn(error)) {
    const retry = await c
      .from("subcontracts")
      .select(withoutStatusCols)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (retry.error) throw new Error(retry.error.message ?? "Failed to load subcontracts.");
    return (retry.data ?? []).map((r: Record<string, unknown>) => {
      const sub = r.subcontractors as { name?: string } | null;
      return {
        id: (r.id as string) ?? "",
        project_id: (r.project_id as string) ?? "",
        subcontractor_id: (r.subcontractor_id as string) ?? "",
        cost_code: (r.cost_code as string | null) ?? null,
        contract_amount: Number(r.contract_amount) || 0,
        status: "Draft",
        description: (r.description as string | null) ?? null,
        start_date: (r.start_date as string | null)?.slice(0, 10) ?? null,
        end_date: (r.end_date as string | null)?.slice(0, 10) ?? null,
        created_at: (r.created_at as string) ?? "",
        subcontractor_name: sub?.name ?? "—",
      };
    });
  }
  if (error) throw new Error(error.message ?? "Failed to load subcontracts.");
  return (rows ?? []).map((r: Record<string, unknown>) => {
    const sub = r.subcontractors as { name?: string } | null;
    return {
      id: (r.id as string) ?? "",
      project_id: (r.project_id as string) ?? "",
      subcontractor_id: (r.subcontractor_id as string) ?? "",
      cost_code: (r.cost_code as string | null) ?? null,
      contract_amount: Number(r.contract_amount) || 0,
      status: ((r.status as string) ?? "Draft") as SubcontractRow["status"],
      description: (r.description as string | null) ?? null,
      start_date: (r.start_date as string | null)?.slice(0, 10) ?? null,
      end_date: (r.end_date as string | null)?.slice(0, 10) ?? null,
      created_at: (r.created_at as string) ?? "",
      subcontractor_name: sub?.name ?? "—",
    };
  });
}

export type SubcontractWithProject = SubcontractRow & {
  project_name: string;
};

/** Fetch subcontracts for a subcontractor with project name. */
export async function getSubcontractsBySubcontractor(subcontractorId: string): Promise<SubcontractWithProject[]> {
  const c = client();
  const selectCols = "id, project_id, subcontractor_id, cost_code, contract_amount, status, description, start_date, end_date, created_at, projects(name)";
  const withoutStatusCols = "id, project_id, subcontractor_id, cost_code, contract_amount, description, start_date, end_date, created_at, projects(name)";

  const { data: rows, error } = await c
    .from("subcontracts")
    .select(selectCols)
    .eq("subcontractor_id", subcontractorId)
    .order("created_at", { ascending: false });
  if (error && isMissingColumn(error)) {
    const retry = await c
      .from("subcontracts")
      .select(withoutStatusCols)
      .eq("subcontractor_id", subcontractorId)
      .order("created_at", { ascending: false });
    if (retry.error) throw new Error(retry.error.message ?? "Failed to load subcontracts.");
    return (retry.data ?? []).map((r: Record<string, unknown>) => {
      const proj = r.projects as { name?: string } | null;
      return {
        id: (r.id as string) ?? "",
        project_id: (r.project_id as string) ?? "",
        subcontractor_id: (r.subcontractor_id as string) ?? "",
        cost_code: (r.cost_code as string | null) ?? null,
        contract_amount: Number(r.contract_amount) || 0,
        status: "Draft",
        description: (r.description as string | null) ?? null,
        start_date: (r.start_date as string | null)?.slice(0, 10) ?? null,
        end_date: (r.end_date as string | null)?.slice(0, 10) ?? null,
        created_at: (r.created_at as string) ?? "",
        project_name: proj?.name ?? "—",
      };
    });
  }
  if (error) throw new Error(error.message ?? "Failed to load subcontracts.");
  return (rows ?? []).map((r: Record<string, unknown>) => {
    const proj = r.projects as { name?: string } | null;
    return {
      id: (r.id as string) ?? "",
      project_id: (r.project_id as string) ?? "",
      subcontractor_id: (r.subcontractor_id as string) ?? "",
      cost_code: (r.cost_code as string | null) ?? null,
      contract_amount: Number(r.contract_amount) || 0,
      status: ((r.status as string) ?? "Draft") as SubcontractRow["status"],
      description: (r.description as string | null) ?? null,
      start_date: (r.start_date as string | null)?.slice(0, 10) ?? null,
      end_date: (r.end_date as string | null)?.slice(0, 10) ?? null,
      created_at: (r.created_at as string) ?? "",
      project_name: proj?.name ?? "—",
    };
  });
}

/** Fetch all subcontracts for summary: id, subcontractor_id, contract_amount. */
export async function getSubcontractsSummaryAll(): Promise<{ id: string; subcontractor_id: string; contract_amount: number }[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("subcontracts")
    .select("id, subcontractor_id, contract_amount");
  if (error) throw new Error(error.message ?? "Failed to load subcontracts.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: (r.id as string) ?? "",
    subcontractor_id: (r.subcontractor_id as string) ?? "",
    contract_amount: Number(r.contract_amount) || 0,
  }));
}

/** Fetch all subcontracts with subcontractor name and project name for dashboard/summary. */
export async function getSubcontractsWithDetailsAll(): Promise<
  { id: string; subcontractor_id: string; project_id: string; subcontractor_name: string; project_name: string }[]
> {
  const c = client();
  const { data: rows, error } = await c
    .from("subcontracts")
    .select("id, subcontractor_id, project_id, subcontractors(name), projects(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load subcontracts.");
  return (rows ?? []).map((r: Record<string, unknown>) => {
    const sub = r.subcontractors as { name?: string } | null;
    const proj = r.projects as { name?: string } | null;
    return {
      id: (r.id as string) ?? "",
      subcontractor_id: (r.subcontractor_id as string) ?? "",
      project_id: (r.project_id as string) ?? "",
      subcontractor_name: sub?.name ?? "—",
      project_name: proj?.name ?? "—",
    };
  });
}

/** Insert one subcontract. */
export async function insertSubcontract(draft: SubcontractDraft): Promise<void> {
  const c = client();
  const { error } = await c.from("subcontracts").insert({
    project_id: draft.project_id,
    subcontractor_id: draft.subcontractor_id,
    cost_code: draft.cost_code?.trim() || null,
    contract_amount: Number(draft.contract_amount) || 0,
    status: draft.status ?? "Draft",
    description: draft.description?.trim() || null,
    start_date: draft.start_date?.slice(0, 10) || null,
    end_date: draft.end_date?.slice(0, 10) || null,
  });
  if (error) throw new Error(error.message ?? "Failed to add subcontract.");
}

export async function updateSubcontractStatus(subcontractId: string, status: SubcontractRow["status"]): Promise<void> {
  const c = client();
  const { error } = await c.from("subcontracts").update({ status }).eq("id", subcontractId);
  if (error) throw new Error(error.message ?? "Failed to update subcontract status.");
}
