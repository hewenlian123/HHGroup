import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

const TABLE = "subcontract_deductions";

export type SubcontractDeductionRow = {
  id: string;
  expense_id: string;
  project_id: string | null;
  subcontractor_id: string;
  subcontract_id: string | null;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type SubcontractDeductionInput = {
  subcontractorId?: string | null;
  subcontractId?: string | null;
  projectId?: string | null;
  amount?: number | string | null;
  note?: string | null;
};

export type SubcontractDeductionOption = {
  subcontractId: string;
  subcontractorId: string;
  projectId: string;
  subcontractorName: string;
  projectName: string;
  costCode: string | null;
  label: string;
};

type SubcontractLookupRow = {
  id: string;
  project_id: string;
  subcontractor_id: string;
  cost_code?: string | null;
  subcontractors?: { name?: string | null } | null;
  projects?: { name?: string | null } | null;
};

function client(explicitClient?: SupabaseClient): SupabaseClient {
  const c = explicitClient ?? getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(message);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function mapDeductionRow(row: Record<string, unknown>): SubcontractDeductionRow {
  return {
    id: String(row.id ?? ""),
    expense_id: String(row.expense_id ?? ""),
    project_id: nonEmpty(row.project_id),
    subcontractor_id: String(row.subcontractor_id ?? ""),
    subcontract_id: nonEmpty(row.subcontract_id),
    amount: money(row.amount),
    note: nonEmpty(row.note),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function optionLabel(row: SubcontractLookupRow): string {
  const subcontractor = row.subcontractors?.name?.trim() || "Subcontractor";
  const project = row.projects?.name?.trim() || "Project";
  const code = row.cost_code?.trim();
  return code ? `${subcontractor} · ${project} · ${code}` : `${subcontractor} · ${project}`;
}

function mapSubcontractOption(row: SubcontractLookupRow): SubcontractDeductionOption {
  const subcontractorName = row.subcontractors?.name?.trim() || "Subcontractor";
  const projectName = row.projects?.name?.trim() || "Project";
  return {
    subcontractId: row.id,
    subcontractorId: row.subcontractor_id,
    projectId: row.project_id,
    subcontractorName,
    projectName,
    costCode: row.cost_code ?? null,
    label: optionLabel(row),
  };
}

export async function getSubcontractDeductionOptions(
  explicitClient?: SupabaseClient
): Promise<SubcontractDeductionOption[]> {
  const c = client(explicitClient);
  const { data, error } = await c
    .from("subcontracts")
    .select("id, project_id, subcontractor_id, cost_code, subcontractors(name), projects(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load subcontract deduction options.");
  return ((data ?? []) as unknown as SubcontractLookupRow[]).map(mapSubcontractOption);
}

export async function getSubcontractDeductionByExpenseId(
  expenseId: string,
  explicitClient?: SupabaseClient
): Promise<SubcontractDeductionRow | null> {
  const id = expenseId.trim();
  if (!id) return null;
  const c = client(explicitClient);
  const { data, error } = await c.from(TABLE).select("*").eq("expense_id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to load subcontract deduction.");
  }
  return data ? mapDeductionRow(data as Record<string, unknown>) : null;
}

export async function getSubcontractDeductionsByExpenseIds(
  expenseIds: string[],
  explicitClient?: SupabaseClient
): Promise<Map<string, SubcontractDeductionRow>> {
  const ids = [...new Set(expenseIds.map((id) => id.trim()).filter(Boolean))];
  const byExpense = new Map<string, SubcontractDeductionRow>();
  if (ids.length === 0) return byExpense;
  const c = client(explicitClient);
  const { data, error } = await c.from(TABLE).select("*").in("expense_id", ids);
  if (error) {
    if (isMissingTable(error)) return byExpense;
    throw new Error(error.message ?? "Failed to load subcontract deductions.");
  }
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const mapped = mapDeductionRow(row);
    if (mapped.expense_id) byExpense.set(mapped.expense_id, mapped);
  }
  return byExpense;
}

export async function getSubcontractDeductionsBySubcontractIds(
  subcontractIds: string[],
  explicitClient?: SupabaseClient
): Promise<SubcontractDeductionRow[]> {
  const ids = [...new Set(subcontractIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const c = client(explicitClient);
  const { data, error } = await c.from(TABLE).select("*").in("subcontract_id", ids);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load subcontract deductions.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapDeductionRow);
}

export async function getSubcontractDeductionsSummaryAll(
  explicitClient?: SupabaseClient
): Promise<{ subcontract_id: string | null; subcontractor_id: string; amount: number }[]> {
  const c = client(explicitClient);
  const { data, error } = await c.from(TABLE).select("subcontract_id, subcontractor_id, amount");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load subcontract deductions.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    subcontract_id: nonEmpty(row.subcontract_id),
    subcontractor_id: String(row.subcontractor_id ?? ""),
    amount: money(row.amount),
  }));
}

async function loadSubcontract(
  c: SupabaseClient,
  subcontractId: string
): Promise<{ id: string; project_id: string; subcontractor_id: string } | null> {
  const { data, error } = await c
    .from("subcontracts")
    .select("id, project_id, subcontractor_id")
    .eq("id", subcontractId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to validate subcontract.");
  return (data as { id: string; project_id: string; subcontractor_id: string } | null) ?? null;
}

async function findProjectSubcontract(
  c: SupabaseClient,
  params: { projectId: string; subcontractorId: string }
): Promise<{ id: string; project_id: string; subcontractor_id: string } | null> {
  const { data, error } = await c
    .from("subcontracts")
    .select("id, project_id, subcontractor_id")
    .eq("project_id", params.projectId)
    .eq("subcontractor_id", params.subcontractorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to validate subcontractor.");
  return (data as { id: string; project_id: string; subcontractor_id: string } | null) ?? null;
}

export async function replaceSubcontractDeductionForExpense(
  expenseId: string,
  input: SubcontractDeductionInput | null,
  explicitClient?: SupabaseClient
): Promise<SubcontractDeductionRow | null> {
  const id = expenseId.trim();
  if (!id) throw new Error("Expense is required.");
  const c = client(explicitClient);
  if (!input) {
    const { error } = await c.from(TABLE).delete().eq("expense_id", id);
    if (error && !isMissingTable(error)) {
      throw new Error(error.message ?? "Failed to remove subcontract deduction.");
    }
    return null;
  }

  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error("Deduction amount must be greater than 0.");

  const projectId = nonEmpty(input.projectId);
  if (!projectId) {
    throw new Error("Choose a project before deducting from a subcontractor.");
  }

  const subcontractIdInput = nonEmpty(input.subcontractId);
  const subcontractorIdInput = nonEmpty(input.subcontractorId);
  let subcontract: { id: string; project_id: string; subcontractor_id: string } | null = null;
  if (subcontractIdInput) {
    subcontract = await loadSubcontract(c, subcontractIdInput);
    if (!subcontract) throw new Error("Selected subcontract was not found.");
    if (subcontract.project_id !== projectId) {
      throw new Error("Selected subcontract does not belong to this project.");
    }
    if (subcontractorIdInput && subcontract.subcontractor_id !== subcontractorIdInput) {
      throw new Error("Selected subcontractor does not match the selected subcontract.");
    }
  } else if (subcontractorIdInput) {
    subcontract = await findProjectSubcontract(c, {
      projectId,
      subcontractorId: subcontractorIdInput,
    });
    if (!subcontract) {
      throw new Error("Selected subcontractor does not have a subcontract on this project.");
    }
  } else {
    throw new Error("Choose a subcontractor for this deduction.");
  }

  const payload = {
    expense_id: id,
    project_id: projectId,
    subcontract_id: subcontract.id,
    subcontractor_id: subcontract.subcontractor_id,
    amount,
    note: nonEmpty(input.note),
  };

  const { data, error } = await c
    .from(TABLE)
    .upsert(payload, { onConflict: "expense_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? "Failed to save subcontract deduction.");
  return data ? mapDeductionRow(data as Record<string, unknown>) : null;
}

export function sumSubcontractDeductions(rows: { amount?: number | null }[] | undefined): number {
  return money((rows ?? []).reduce((sum, row) => sum + money(row.amount), 0));
}
