/**
 * Subcontract bills — Supabase only. No mock data.
 * Table: subcontract_bills.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type SubcontractBillRow = {
  id: string;
  subcontract_id: string;
  project_id: string;
  bill_date: string;
  due_date: string | null;
  amount: number;
  description: string | null;
  status: string;
  created_at: string;
};

export type SubcontractBillDraft = {
  subcontract_id: string;
  project_id: string;
  bill_date: string;
  due_date?: string | null;
  amount: number;
  description?: string | null;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingFunction(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /could not find the function|schema cache/i.test(m);
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|does not exist.*column/i.test(m);
}

const COLS_FULL =
  "id, subcontract_id, project_id, bill_date, due_date, amount, description, status, created_at";
const COLS_NO_DUE =
  "id, subcontract_id, project_id, bill_date, amount, description, status, created_at";

function mapBillRow(r: Record<string, unknown>): SubcontractBillRow {
  return {
    id: (r.id as string) ?? "",
    subcontract_id: (r.subcontract_id as string) ?? "",
    project_id: (r.project_id as string) ?? "",
    bill_date: ((r.bill_date as string) ?? "").slice(0, 10),
    due_date: (r.due_date as string | null)?.slice(0, 10) ?? null,
    amount: Number(r.amount) || 0,
    description: (r.description as string | null) ?? null,
    status: (r.status as string) ?? "Pending",
    created_at: (r.created_at as string) ?? "",
  };
}

/** Fetch all bills for a subcontract, order by bill_date desc. */
export async function getBillsBySubcontract(subcontractId: string): Promise<SubcontractBillRow[]> {
  const c = client();
  const first = await c
    .from("subcontract_bills")
    .select(COLS_FULL)
    .eq("subcontract_id", subcontractId)
    .order("bill_date", { ascending: false });
  if (!first.error) return (first.data ?? []).map((r: Record<string, unknown>) => mapBillRow(r));
  if (!isMissingColumn(first.error))
    throw new Error(first.error.message ?? "Failed to load bills.");
  const fallback = await c
    .from("subcontract_bills")
    .select(COLS_NO_DUE)
    .eq("subcontract_id", subcontractId)
    .order("bill_date", { ascending: false });
  if (fallback.error) throw new Error(fallback.error.message ?? "Failed to load bills.");
  return (fallback.data ?? []).map((r: Record<string, unknown>) => mapBillRow(r));
}

/** Create one subcontract bill via RPC (enforces total bills <= contract amount). */
export async function insertSubcontractBill(draft: SubcontractBillDraft): Promise<void> {
  const c = client();
  const { error } = await c.rpc("create_subcontract_bill_guard", {
    p_subcontract_id: draft.subcontract_id,
    p_project_id: draft.project_id,
    p_bill_date: draft.bill_date.slice(0, 10),
    p_due_date: draft.due_date ? draft.due_date.slice(0, 10) : null,
    p_amount: Number(draft.amount) || 0,
    p_description: draft.description?.trim() || null,
  });
  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message ?? "Failed to add bill.");
    // Fallback: direct insert without contract-amount guard.
    const { error: insErr } = await c.from("subcontract_bills").insert({
      subcontract_id: draft.subcontract_id,
      project_id: draft.project_id,
      bill_date: draft.bill_date.slice(0, 10),
      due_date: draft.due_date ? draft.due_date.slice(0, 10) : null,
      amount: Number(draft.amount) || 0,
      description: draft.description?.trim() || null,
      status: "Pending",
    });
    if (insErr) throw new Error(insErr.message ?? "Failed to add bill.");
  }
}

/** Approve a subcontract bill via RPC (sets status to Approved, adds amount to project.spent). */
export async function approveSubcontractBill(billId: string): Promise<void> {
  const c = client();
  const { error } = await c.rpc("approve_subcontract_bill", { p_bill_id: billId });
  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message ?? "Failed to approve bill.");
    const { error: updErr } = await c
      .from("subcontract_bills")
      .update({ status: "Approved" })
      .eq("id", billId);
    if (updErr) throw new Error(updErr.message ?? "Failed to approve bill.");
  }
}

export async function voidSubcontractBill(billId: string): Promise<void> {
  const c = client();
  const { error } = await c.rpc("void_subcontract_bill", { p_bill_id: billId });
  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message ?? "Failed to void bill.");
    const { error: updErr } = await c
      .from("subcontract_bills")
      .update({ status: "Void" })
      .eq("id", billId);
    if (updErr) throw new Error(updErr.message ?? "Failed to void bill.");
  }
}

export async function updateSubcontractBill(
  billId: string,
  patch: Partial<Pick<SubcontractBillDraft, "bill_date" | "due_date" | "amount" | "description">>
): Promise<void> {
  const c = client();
  const { data: row, error: rowErr } = await c
    .from("subcontract_bills")
    .select("id, subcontract_id, amount, status")
    .eq("id", billId)
    .maybeSingle();
  if (rowErr) throw new Error(rowErr.message ?? "Failed to load bill.");
  if (!row) throw new Error("Bill not found");
  const status = (row as { status?: string } | null)?.status ?? "";
  if (status !== "Pending") throw new Error("Only Draft bills can be edited");

  // Contract guard: total(other non-void bills) + newAmount <= contract_amount
  const subcontractId = (row as { subcontract_id: string }).subcontract_id;
  const newAmount =
    patch.amount !== undefined
      ? Number(patch.amount) || 0
      : Number((row as { amount?: number }).amount) || 0;
  const [{ data: subcontractRow, error: subErr }, { data: totals, error: totErr }] =
    await Promise.all([
      c.from("subcontracts").select("contract_amount").eq("id", subcontractId).maybeSingle(),
      c.from("subcontract_bills").select("id,amount,status").eq("subcontract_id", subcontractId),
    ]);
  if (subErr) throw new Error(subErr.message ?? "Failed to load subcontract.");
  if (totErr) throw new Error(totErr.message ?? "Failed to load subcontract bills.");
  const contractAmount =
    Number((subcontractRow as { contract_amount?: number } | null)?.contract_amount) || 0;
  const otherTotal = ((totals ?? []) as Array<{ id?: string; amount?: number; status?: string }>)
    .filter((r) => r && r.status !== "Void" && String(r.id ?? "") !== billId)
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (otherTotal + newAmount > contractAmount)
    throw new Error("Bill exceeds subcontract contract amount");

  const updates: Record<string, unknown> = {};
  if (patch.bill_date !== undefined)
    updates.bill_date = patch.bill_date ? patch.bill_date.slice(0, 10) : null;
  if (patch.due_date !== undefined)
    updates.due_date = patch.due_date ? patch.due_date.slice(0, 10) : null;
  if (patch.amount !== undefined) updates.amount = newAmount;
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  const { error } = await c.from("subcontract_bills").update(updates).eq("id", billId);
  if (error) throw new Error(error.message ?? "Failed to update bill.");
}

export async function deleteSubcontractBillDraft(billId: string): Promise<void> {
  const c = client();
  const { data: row, error: rowErr } = await c
    .from("subcontract_bills")
    .select("status")
    .eq("id", billId)
    .maybeSingle();
  if (rowErr) throw new Error(rowErr.message ?? "Failed to load bill.");
  const status = (row as { status?: string } | null)?.status ?? "";
  if (status !== "Pending") throw new Error("Only Draft bills can be deleted");
  const { error } = await c.from("subcontract_bills").delete().eq("id", billId);
  if (error) throw new Error(error.message ?? "Failed to delete bill.");
}

/** Fetch all bills for summary: subcontract_id, amount, status. */
export async function getBillsSummaryAll(): Promise<
  { subcontract_id: string; amount: number; status: string }[]
> {
  const c = client();
  const { data: rows, error } = await c
    .from("subcontract_bills")
    .select("subcontract_id, amount, status");
  if (error) throw new Error(error.message ?? "Failed to load bills.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    subcontract_id: (r.subcontract_id as string) ?? "",
    amount: Number(r.amount) || 0,
    status: (r.status as string) ?? "Pending",
  }));
}

/** Fetch all bills with id, amount, status (for cashflow approved unpaid). */
export async function getBillsAll(): Promise<{ id: string; amount: number; status: string }[]> {
  const c = client();
  const { data: rows, error } = await c.from("subcontract_bills").select("id, amount, status");
  if (error) throw new Error(error.message ?? "Failed to load bills.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: (r.id as string) ?? "",
    amount: Number(r.amount) || 0,
    status: (r.status as string) ?? "Pending",
  }));
}

/** Sum of approved/paid bill amounts for a project. */
export async function getApprovedSubcontractBillsTotalByProject(
  projectId: string
): Promise<number> {
  const c = client();
  const { data: rows, error } = await c
    .from("subcontract_bills")
    .select("amount, status")
    .eq("project_id", projectId)
    .in("status", ["Approved", "Paid"]);
  if (error) throw new Error(error.message ?? "Failed to load subcontract bills.");
  return (rows ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount ?? 0), 0);
}

/** Fetch all bills for the given subcontract ids (e.g. for one subcontractor). */
export async function getBillsBySubcontractIds(
  subcontractIds: string[]
): Promise<SubcontractBillRow[]> {
  if (subcontractIds.length === 0) return [];
  const c = client();
  const first = await c
    .from("subcontract_bills")
    .select(COLS_FULL)
    .in("subcontract_id", subcontractIds)
    .order("bill_date", { ascending: false });
  if (!first.error) return (first.data ?? []).map((r: Record<string, unknown>) => mapBillRow(r));
  if (!isMissingColumn(first.error))
    throw new Error(first.error.message ?? "Failed to load bills.");
  const fallback = await c
    .from("subcontract_bills")
    .select(COLS_NO_DUE)
    .in("subcontract_id", subcontractIds)
    .order("bill_date", { ascending: false });
  if (fallback.error) throw new Error(fallback.error.message ?? "Failed to load bills.");
  return (fallback.data ?? []).map((r: Record<string, unknown>) => mapBillRow(r));
}
