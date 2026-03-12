/**
 * Projects — Supabase only. No mock data.
 * Table: projects.
 */

import { supabase } from "@/lib/supabase";

export type ProjectStatus = "active" | "pending" | "completed";

export type ProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  budget: number | null;
  spent: number | null;
  created_at: string | null;
  updated_at: string | null;
  client: string | null;
  client_name: string | null;
  address: string | null;
  project_manager: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  estimate_ref: string | null;
  source_estimate_id: string | null;
  snapshot_revenue: number | null;
  snapshot_budget_cost: number | null;
  snapshot_breakdown: { materials?: number; labor?: number; vendor?: number; other?: number } | null;
};

export type Project = {
  id: string;
  name: string;
  status: ProjectStatus;
  budget: number;
  spent: number;
  updated: string;
  created_at?: string | null;
  updated_at?: string | null;
  client?: string;
  address?: string;
  projectManager?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  estimateRef?: string;
  sourceEstimateId?: string | null;
  snapshotRevenue?: number | null;
  snapshotBudgetCost?: number | null;
  snapshotBudgetBreakdown?: { materials: number; labor: number; vendor: number; other: number } | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

const HINT = "Run supabase/migrations/202603081650_projects.sql in Supabase Dashboard → SQL Editor.";

function toProject(r: ProjectRow): Project {
  const status = (r.status === "active" || r.status === "pending" || r.status === "completed" ? r.status : "pending") as ProjectStatus;
  const clientVal = r.client ?? (r as { client_name?: string | null }).client_name ?? null;
  return {
    id: r.id,
    name: r.name ?? "",
    status,
    budget: Number(r.budget) || 0,
    spent: Number(r.spent) || 0,
    updated: r.updated_at ?? r.created_at ?? new Date().toISOString().slice(0, 10),
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
    ...(clientVal != null && clientVal !== "" ? { client: clientVal } : {}),
    ...(r.address != null && r.address !== "" ? { address: r.address } : {}),
    ...(r.project_manager != null && r.project_manager !== "" ? { projectManager: r.project_manager } : {}),
    ...(r.start_date != null ? { startDate: String(r.start_date).slice(0, 10) } : {}),
    ...(r.end_date != null ? { endDate: String(r.end_date).slice(0, 10) } : {}),
    ...(r.notes != null && r.notes !== "" ? { notes: r.notes } : {}),
    ...(r.estimate_ref != null && r.estimate_ref !== "" ? { estimateRef: r.estimate_ref } : {}),
    ...(r.source_estimate_id != null ? { sourceEstimateId: r.source_estimate_id } : {}),
    ...(r.snapshot_revenue != null ? { snapshotRevenue: Number(r.snapshot_revenue) } : {}),
    ...(r.snapshot_budget_cost != null ? { snapshotBudgetCost: Number(r.snapshot_budget_cost) } : {}),
    ...(r.snapshot_breakdown != null && typeof r.snapshot_breakdown === "object"
      ? { snapshotBudgetBreakdown: r.snapshot_breakdown as { materials: number; labor: number; vendor: number; other: number } }
      : {}),
  };
}

const COLS = "id,name,status,budget,spent,created_at,updated_at,client,client_name,address,project_manager,start_date,end_date,notes,estimate_ref,source_estimate_id,snapshot_revenue,snapshot_budget_cost,snapshot_breakdown";

export async function getProjects(): Promise<Project[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("projects")
    .select(COLS)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new Error(`Projects table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return (rows ?? []).map((r) => toProject(r as ProjectRow));
}

/**
 * Dashboard-optimized project list: only selects fields needed for summary + health table.
 * Avoids pulling large optional columns (notes, snapshots, etc).
 */
export async function getProjectsDashboard(limit = 200): Promise<Array<Pick<Project, "id" | "name" | "status" | "budget" | "updated">>> {
  const c = client();
  const cap = Math.max(1, Math.min(limit, 1000));
  const { data: rows, error } = await c
    .from("projects")
    .select("id,name,status,budget,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(cap);
  if (error) {
    if (isMissingTable(error)) throw new Error(`Projects table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }

  return (rows ?? []).map((r) => {
    const row = r as { id: string; name: string | null; status: string | null; budget: number | null; updated_at: string | null; created_at: string | null };
    const status = (row.status === "active" || row.status === "pending" || row.status === "completed" ? row.status : "pending") as ProjectStatus;
    return {
      id: row.id,
      name: row.name ?? "",
      status,
      budget: Number(row.budget) || 0,
      updated: row.updated_at ?? row.created_at ?? new Date().toISOString().slice(0, 10),
    };
  });
}

export async function getProjectById(id: string): Promise<Project | null> {
  const c = client();
  const { data: r, error } = await c
    .from("projects")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new Error(`Projects table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return r ? toProject(r as ProjectRow) : null;
}

/** Used to prevent duplicate convert-from-estimate: one estimate → one project. */
export async function getProjectBySourceEstimateId(estimateId: string): Promise<Project | null> {
  const c = client();
  const { data: r, error } = await c
    .from("projects")
    .select(COLS)
    .eq("source_estimate_id", estimateId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new Error(`Projects table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return r ? toProject(r as ProjectRow) : null;
}

export type CreateProjectInput = {
  name: string;
  budget: number;
  status?: ProjectStatus;
  client?: string;
  address?: string;
  projectManager?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  estimateRef?: string;
  sourceEstimateId?: string | null;
  snapshotRevenue?: number | null;
  snapshotBudgetCost?: number | null;
  snapshotBreakdown?: { materials: number; labor: number; vendor: number; other: number } | null;
};

/** Single INSERT; id is uuid from DB. Prevents duplicate by design (no idempotency key; use sourceEstimateId for convert flow). */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const c = client();
  const name = input.name.trim();
  const budget = Math.max(0, Number(input.budget) || 0);
  const status = input.status ?? "pending";
  const row: Record<string, unknown> = {
    name: name || "Unnamed Project",
    status,
    budget,
    spent: 0,
    ...(input.client != null && input.client !== "" ? { client: input.client.trim(), client_name: input.client.trim() } : {}),
    ...(input.address != null && input.address !== "" ? { address: input.address.trim() } : {}),
    ...(input.projectManager != null && input.projectManager !== "" ? { project_manager: input.projectManager.trim() } : {}),
    ...(input.startDate != null && input.startDate !== "" ? { start_date: input.startDate.trim() } : {}),
    ...(input.endDate != null && input.endDate !== "" ? { end_date: input.endDate.trim() } : {}),
    ...(input.notes != null && input.notes !== "" ? { notes: input.notes.trim() } : {}),
    ...(input.estimateRef != null && input.estimateRef !== "" ? { estimate_ref: input.estimateRef.trim() } : {}),
    ...(input.sourceEstimateId != null && input.sourceEstimateId !== "" ? { source_estimate_id: input.sourceEstimateId } : {}),
    ...(input.snapshotRevenue != null ? { snapshot_revenue: input.snapshotRevenue } : {}),
    ...(input.snapshotBudgetCost != null ? { snapshot_budget_cost: input.snapshotBudgetCost } : {}),
    ...(input.snapshotBreakdown != null ? { snapshot_breakdown: input.snapshotBreakdown } : {}),
  };
  const { data: inserted, error } = await c.from("projects").insert(row).select(COLS).single();
  if (error) {
    const raw = error.message ? ` (${error.message})` : "";
    throw new Error(isMissingTable(error) ? `Projects table missing. ${HINT}${raw}` : error.message);
  }
  if (!inserted) throw new Error("Failed to create project: no id returned.");
  return toProject(inserted as ProjectRow);
}

export type UpdateProjectPatch = Partial<{
  name: string;
  status: ProjectStatus;
  budget: number;
  spent: number;
  client: string;
  address: string;
  projectManager: string;
  startDate: string;
  endDate: string;
  notes: string;
  estimateRef: string;
  sourceEstimateId: string | null;
  snapshotRevenue: number | null;
  snapshotBudgetCost: number | null;
  snapshotBreakdown: { materials: number; labor: number; vendor: number; other: number } | null;
}>;

export async function updateProject(id: string, patch: UpdateProjectPatch): Promise<Project | null> {
  const c = client();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.budget !== undefined) row.budget = Math.max(0, Number(patch.budget));
  if (patch.spent !== undefined) row.spent = Math.max(0, Number(patch.spent));
  if (patch.client !== undefined) {
    row.client = patch.client.trim();
    row.client_name = patch.client.trim();
  }
  if (patch.address !== undefined) row.address = patch.address.trim();
  if (patch.projectManager !== undefined) row.project_manager = patch.projectManager.trim();
  if (patch.startDate !== undefined) row.start_date = patch.startDate;
  if (patch.endDate !== undefined) row.end_date = patch.endDate;
  if (patch.notes !== undefined) row.notes = patch.notes.trim();
  if (patch.estimateRef !== undefined) row.estimate_ref = patch.estimateRef.trim();
  if (patch.sourceEstimateId !== undefined) row.source_estimate_id = patch.sourceEstimateId;
  if (patch.snapshotRevenue !== undefined) row.snapshot_revenue = patch.snapshotRevenue;
  if (patch.snapshotBudgetCost !== undefined) row.snapshot_budget_cost = patch.snapshotBudgetCost;
  if (patch.snapshotBreakdown !== undefined) row.snapshot_breakdown = patch.snapshotBreakdown;
  row.updated_at = new Date().toISOString();

  if (Object.keys(row).length === 0) {
    const existing = await getProjectById(id);
    return existing;
  }

  const { data: updated, error } = await c
    .from("projects")
    .update(row)
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new Error(`Projects table not found. ${HINT}`);
    throw new Error(error.message ?? HINT);
  }
  return updated ? toProject(updated as ProjectRow) : null;
}

export async function deleteProject(id: string): Promise<boolean> {
  const c = client();
  const { error } = await c.from("projects").delete().eq("id", id);
  if (error) {
    if (isMissingTable(error)) throw new Error(`Projects table not found. ${HINT}`);
    throw new Error(error.message ?? HINT);
  }
  return true;
}

export type ProjectUsageCounts = {
  labor_entries: number;
  expenses: number;
  bills: number;
  invoices: number;
  subcontracts: number;
  project_change_orders: number;
};

/** Count records that reference the project. Used to block deletion when in use. */
export async function getProjectUsageCounts(projectId: string): Promise<ProjectUsageCounts> {
  const c = client();
  const pid = projectId;

  const safeCount = async (
    table: string,
    column: string,
    value: string
  ): Promise<number> => {
    const { count, error } = await c
      .from(table)
      .select(column, { count: "exact", head: true })
      .eq(column, value);
    if (error || count == null) return 0;
    return count;
  };

  const laborOr = async (): Promise<number> => {
    const { data, error } = await c
      .from("labor_entries")
      .select("id")
      .or(`project_am_id.eq.${pid},project_pm_id.eq.${pid}`);
    if (error) return 0;
    return (data ?? []).length;
  };

  const [labor_entries, expenses, bills, invoices, subcontracts, project_change_orders] = await Promise.all([
    laborOr(),
    safeCount("expense_lines", "project_id", pid),
    safeCount("ap_bills", "project_id", pid),
    safeCount("invoices", "project_id", pid),
    safeCount("subcontracts", "project_id", pid),
    safeCount("project_change_orders", "project_id", pid),
  ]);

  return {
    labor_entries,
    expenses,
    bills,
    invoices,
    subcontracts,
    project_change_orders,
  };
}
