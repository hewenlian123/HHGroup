/**
 * Change Orders — Supabase only. No mock data.
 * Tables: project_change_orders, project_change_order_items, project_budget_items, project_change_order_attachments.
 *
 * Status flow: Draft → Pending Approval → Approved | Rejected.
 * Only Approved change orders affect revenue (canonical profit model: amount or total).
 */

import { getSupabaseClient } from "@/lib/supabase";

export type ChangeOrderStatus = "Draft" | "Pending Approval" | "Approved" | "Rejected";

export type ChangeOrderRow = {
  id: string;
  project_id: string;
  number: string;
  status: string;
  total?: number;
  total_amount?: number;
  amount?: number | null;
  date?: string;
  created_at?: string;
  approved_at: string | null;
  approved_by?: string | null;
  title?: string | null;
  description?: string | null;
  cost_impact?: number | null;
  schedule_impact_days?: number | null;
};

export type ChangeOrderItemRow = {
  id: string;
  change_order_id: string;
  cost_code: string;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
};

export type ChangeOrder = {
  id: string;
  projectId: string;
  number: string;
  status: ChangeOrderStatus;
  total: number;
  amount: number | null;
  date: string;
  approvedAt: string | null;
  approvedBy: string | null;
  title: string | null;
  description: string | null;
  costImpact: number | null;
  scheduleImpactDays: number | null;
};

export type ChangeOrderItem = {
  id: string;
  changeOrderId: string;
  costCode: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export type ChangeOrderAttachmentRow = {
  id: string;
  change_order_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type ChangeOrderAttachment = {
  id: string;
  changeOrderId: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
};

export type ProjectBudgetItemRow = {
  id: string;
  project_id: string;
  change_order_id: string;
  cost_code: string;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

function isMissingFunction(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /could not find the function|schema cache/i.test(m);
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /column.*does not exist|does not exist.*column|undefined column|could not find the.*column|schema cache.*column/i.test(m);
}

function normalizeStatus(s: string | null | undefined): ChangeOrderStatus {
  if (s === "Approved") return "Approved";
  if (s === "Rejected") return "Rejected";
  if (s === "Pending Approval" || s === "Submitted") return "Pending Approval";
  return "Draft";
}

function toChangeOrder(r: ChangeOrderRow): ChangeOrder {
  const total = Number(r.total ?? r.total_amount ?? 0);
  const date = r.date ?? (r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  return {
    id: r.id,
    projectId: r.project_id,
    number: r.number,
    status: normalizeStatus(r.status),
    total,
    amount: r.amount != null ? Number(r.amount) : null,
    date,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by ?? null,
    title: r.title ?? null,
    description: r.description ?? null,
    costImpact: r.cost_impact != null ? Number(r.cost_impact) : null,
    scheduleImpactDays: r.schedule_impact_days != null ? Number(r.schedule_impact_days) : null,
  };
}

function toChangeOrderItem(r: ChangeOrderItemRow): ChangeOrderItem {
  return {
    id: r.id,
    changeOrderId: r.change_order_id,
    costCode: r.cost_code,
    description: r.description,
    qty: Number(r.qty),
    unit: r.unit,
    unitPrice: Number(r.unit_price),
    total: Number(r.total),
  };
}

function toAttachment(r: ChangeOrderAttachmentRow): ChangeOrderAttachment {
  return {
    id: r.id,
    changeOrderId: r.change_order_id,
    fileName: r.file_name,
    storagePath: r.storage_path,
    mimeType: r.mime_type ?? null,
    sizeBytes: Number(r.size_bytes) || 0,
    createdAt: r.created_at,
  };
}

const HINT = "Run supabase/migrations/202603111000_change_order_management.sql.";

const CO_COLS =
  "id,project_id,number,status,total,total_amount,amount,date,created_at,approved_at,approved_by,title,description,cost_impact,schedule_impact_days";
const CO_COLS_NO_AMOUNT =
  "id,project_id,number,status,total,total_amount,date,created_at,approved_at,approved_by,title,description,cost_impact,schedule_impact_days";
const CO_COLS_LEGACY =
  "id,project_id,number,status,total,total_amount,date,created_at,approved_at";

async function selectChangeOrders(
  c: ReturnType<typeof client>,
  projectId: string
): Promise<{ data: unknown[] | null; error: { message?: string } | null }> {
  const first = await c
    .from("project_change_orders")
    .select(CO_COLS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .order("number", { ascending: false });
  if (!first.error) return { data: first.data as unknown[], error: null };
  if (!isMissingColumn(first.error)) return { data: null, error: first.error };

  const retry1 = await c
    .from("project_change_orders")
    .select(CO_COLS_NO_AMOUNT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .order("number", { ascending: false });
  if (!retry1.error) return { data: retry1.data as unknown[], error: null };
  if (!isMissingColumn(retry1.error)) return { data: null, error: retry1.error };

  const retry2 = await c
    .from("project_change_orders")
    .select(CO_COLS_LEGACY)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .order("number", { ascending: false });
  return { data: retry2.data as unknown[], error: (retry2.error as { message?: string } | null) };
}

async function selectChangeOrderById(
  c: ReturnType<typeof client>,
  id: string
): Promise<{ data: unknown | null; error: { message?: string } | null }> {
  const first = await c.from("project_change_orders").select(CO_COLS).eq("id", id).maybeSingle();
  if (!first.error) return { data: first.data as unknown, error: null };
  if (!isMissingColumn(first.error)) return { data: null, error: first.error };

  const retry1 = await c.from("project_change_orders").select(CO_COLS_NO_AMOUNT).eq("id", id).maybeSingle();
  if (!retry1.error) return { data: retry1.data as unknown, error: null };
  if (!isMissingColumn(retry1.error)) return { data: null, error: retry1.error };

  const retry2 = await c.from("project_change_orders").select(CO_COLS_LEGACY).eq("id", id).maybeSingle();
  return { data: retry2.data as unknown, error: (retry2.error as { message?: string } | null) };
}

// —— Read ——

export async function getChangeOrdersByProject(projectId: string): Promise<ChangeOrder[]> {
  const c = client();
  const { data: rows, error } = await selectChangeOrders(c, projectId);
  if (error) {
    if (isMissingTable(error)) throw new Error(`Change orders table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return (rows ?? []).map((r) => toChangeOrder(r as ChangeOrderRow));
}

export async function getChangeOrderById(id: string): Promise<ChangeOrder | null> {
  const c = client();
  const { data: r, error } = await selectChangeOrderById(c, id);
  if (error) {
    if (isMissingTable(error)) throw new Error(`Change orders table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return r ? toChangeOrder(r as ChangeOrderRow) : null;
}

export async function getChangeOrderItems(changeOrderId: string): Promise<ChangeOrderItem[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_change_order_items")
    .select("id, change_order_id, cost_code, description, qty, unit, unit_price, total")
    .eq("change_order_id", changeOrderId)
    .order("cost_code");
  if (error) {
    if (isMissingTable(error)) throw new Error(`Change order items table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return (rows ?? []).map(toChangeOrderItem);
}

export async function getChangeOrderAttachments(changeOrderId: string): Promise<ChangeOrderAttachment[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_change_order_attachments")
    .select("id, change_order_id, file_name, storage_path, mime_type, size_bytes, created_at")
    .eq("change_order_id", changeOrderId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load attachments.");
  }
  return (rows ?? []).map((r) => toAttachment(r as ChangeOrderAttachmentRow));
}

export async function getProjectBudgetItems(projectId: string): Promise<ProjectBudgetItemRow[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_budget_items")
    .select("id, project_id, change_order_id, cost_code, description, qty, unit, unit_price, total")
    .eq("project_id", projectId);
  if (error) {
    if (isMissingTable(error)) throw new Error(`Project budget items table not found. ${HINT}`);
    throw new Error(error.message ? `${error.message} ${HINT}` : HINT);
  }
  return rows ?? [];
}

// —— Create ——

async function getNextChangeOrderNumber(c: ReturnType<typeof client>, projectId: string): Promise<string> {
  const { data: numRow, error: numErr } = await c.rpc("next_change_order_number", {
    p_project_id: projectId,
  });
  if (numErr) {
    if (!isMissingFunction(numErr)) {
      const raw = numErr.message ? ` (${numErr.message})` : "";
      throw new Error(`Failed to get CO number. ${HINT}${raw}`);
    }
    // Fallback: count existing COs for this project and generate a number.
    const { data: existing } = await c
      .from("project_change_orders")
      .select("id")
      .eq("project_id", projectId);
    const seq = ((existing ?? []).length + 1);
    return `CO-${String(seq).padStart(4, "0")}`;
  }
  if (typeof numRow === "string" && numRow) return numRow;
  if (Array.isArray(numRow) && numRow[0] != null && typeof (numRow[0] as { next_change_order_number?: string }).next_change_order_number === "string")
    return (numRow[0] as { next_change_order_number: string }).next_change_order_number;
  if (typeof numRow === "object" && numRow !== null && typeof (numRow as { next_change_order_number?: string }).next_change_order_number === "string")
    return (numRow as { next_change_order_number: string }).next_change_order_number;
  throw new Error(`Failed to get CO number: unexpected RPC result. ${HINT}`);
}

export type CreateChangeOrderInput = {
  title?: string | null;
  description?: string | null;
  amount?: number | null;
  costImpact?: number | null;
  scheduleImpactDays?: number | null;
};

export async function createChangeOrder(projectId: string, input?: CreateChangeOrderInput): Promise<ChangeOrder> {
  const c = client();
  const number = await getNextChangeOrderNumber(c, projectId);
  const sequence = parseInt(number.replace(/^CO-0*/, "") || "0", 10) || 1;
  const date = new Date().toISOString().slice(0, 10);
  const payload: Record<string, unknown> = {
    project_id: projectId,
    number,
    sequence,
    status: "Draft",
    total: 0,
    total_amount: 0,
    date,
  };
  if (input?.title != null) payload.title = input.title;
  if (input?.description != null) payload.description = input.description;
  if (input?.amount != null) payload.amount = input.amount;
  if (input?.costImpact != null) payload.cost_impact = input.costImpact;
  if (input?.scheduleImpactDays != null) payload.schedule_impact_days = input.scheduleImpactDays;
  const first = await c.from("project_change_orders").insert(payload).select(CO_COLS).single();
  if (first.error) {
    const raw = first.error.message ? ` (${first.error.message})` : "";
    if (isMissingTable(first.error)) throw new Error(`Change orders table missing. ${HINT}${raw}`);
    if (isMissingColumn(first.error)) {
      // Insert may have succeeded but select failed (e.g. approved_by missing). Fetch by project_id+number with legacy columns.
      const fetched = await c
        .from("project_change_orders")
        .select(CO_COLS_LEGACY)
        .eq("project_id", projectId)
        .eq("number", number)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!fetched.error && fetched.data) return toChangeOrder(fetched.data as ChangeOrderRow);
      // Otherwise insert failed too: retry without amount and select legacy columns.
      const payloadNoAmount = { ...payload };
      delete (payloadNoAmount as Record<string, unknown>).amount;
      const retry = await c.from("project_change_orders").insert(payloadNoAmount).select(CO_COLS_LEGACY).single();
      if (!retry.error && retry.data) return toChangeOrder(retry.data as ChangeOrderRow);
      throw new Error(retry.error?.message ? `${retry.error.message} ${HINT}` : HINT);
    }
    throw new Error(first.error.message);
  }
  if (!first.data) throw new Error("Failed to create change order: no id returned.");
  return toChangeOrder(first.data as ChangeOrderRow);
}

export async function addChangeOrderAttachment(
  changeOrderId: string,
  att: { fileName: string; storagePath: string; mimeType?: string | null; sizeBytes?: number }
): Promise<ChangeOrderAttachment | null> {
  const c = client();
  const { data: row, error } = await c
    .from("project_change_order_attachments")
    .insert({
      change_order_id: changeOrderId,
      file_name: att.fileName,
      storage_path: att.storagePath,
      mime_type: att.mimeType ?? null,
      size_bytes: att.sizeBytes ?? 0,
    })
    .select("id, change_order_id, file_name, storage_path, mime_type, size_bytes, created_at")
    .single();
  if (error) return null;
  return row ? toAttachment(row as ChangeOrderAttachmentRow) : null;
}

export async function deleteChangeOrderAttachment(attachmentId: string): Promise<boolean> {
  const c = client();
  const { error } = await c.from("project_change_order_attachments").delete().eq("id", attachmentId);
  return !error;
}

export async function addChangeOrderItem(
  changeOrderId: string,
  item: { costCode: string; description: string; qty: number; unit: string; unitPrice: number }
): Promise<ChangeOrderItem | null> {
  const c = client();
  const co = await getChangeOrderById(changeOrderId);
  if (!co || co.status !== "Draft") return null;
  const total = item.qty * item.unitPrice;
  const { data: row, error } = await c
    .from("project_change_order_items")
    .insert({
      change_order_id: changeOrderId,
      project_id: co.projectId,
      cost_code: item.costCode,
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      unit_price: item.unitPrice,
      total,
    })
    .select("id, change_order_id, cost_code, description, qty, unit, unit_price, total")
    .single();
  if (error) return null;
  if (!row) return null;
  await recomputeChangeOrderTotal(c, changeOrderId);
  return toChangeOrderItem(row);
}

async function recomputeChangeOrderTotal(c: ReturnType<typeof client>, changeOrderId: string): Promise<void> {
  const { data: rows } = await c
    .from("project_change_order_items")
    .select("total")
    .eq("change_order_id", changeOrderId);
  const sum = (rows ?? []).reduce((s, r) => s + Number(r.total), 0);
  await c.from("project_change_orders").update({ total: sum, total_amount: sum }).eq("id", changeOrderId);
}

// —— Update ——

export type UpdateChangeOrderPatch = {
  title?: string | null;
  description?: string | null;
  amount?: number | null;
  costImpact?: number | null;
  scheduleImpactDays?: number | null;
};

export async function updateChangeOrder(changeOrderId: string, patch: UpdateChangeOrderPatch): Promise<boolean> {
  const c = client();
  const co = await getChangeOrderById(changeOrderId);
  if (!co || co.status !== "Draft") return false;
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.amount !== undefined) updates.amount = patch.amount;
  if (patch.costImpact !== undefined) updates.cost_impact = patch.costImpact;
  if (patch.scheduleImpactDays !== undefined) updates.schedule_impact_days = patch.scheduleImpactDays;
  if (Object.keys(updates).length === 0) return true;
  const res = await c.from("project_change_orders").update(updates).eq("id", changeOrderId);
  if (!res.error) return true;
  if (isMissingColumn(res.error) && "amount" in updates) {
    // Older schema: drop amount update and retry.
    const retryUpdates = { ...updates };
    delete (retryUpdates as Record<string, unknown>).amount;
    const retry = await c.from("project_change_orders").update(retryUpdates).eq("id", changeOrderId);
    return !retry.error;
  }
  return false;
}

export async function updateChangeOrderItem(
  changeOrderId: string,
  itemId: string,
  patch: { description?: string; qty?: number; unit?: string; unitPrice?: number }
): Promise<boolean> {
  const c = client();
  const co = await getChangeOrderById(changeOrderId);
  if (!co || co.status !== "Draft") return false;
  const itemRows = await c.from("project_change_order_items").select("*").eq("id", itemId).eq("change_order_id", changeOrderId).maybeSingle();
  if (itemRows.error || !itemRows.data) return false;
  const updates: Record<string, unknown> = {};
  if (patch.description != null) updates.description = patch.description;
  if (patch.qty != null) updates.qty = patch.qty;
  if (patch.unit != null) updates.unit = patch.unit;
  if (patch.unitPrice != null) updates.unit_price = patch.unitPrice;
  if (Object.keys(updates).length === 0) return true;
  const { data: current } = itemRows;
  const qty = patch.qty != null ? patch.qty : Number(current.qty);
  const unitPrice = patch.unitPrice != null ? patch.unitPrice : Number(current.unit_price);
  updates.total = qty * unitPrice;
  const { error } = await c.from("project_change_order_items").update(updates).eq("id", itemId).eq("change_order_id", changeOrderId);
  if (error) return false;
  await recomputeChangeOrderTotal(c, changeOrderId);
  return true;
}

export async function deleteChangeOrderItem(changeOrderId: string, itemId: string): Promise<boolean> {
  const c = client();
  const co = await getChangeOrderById(changeOrderId);
  if (!co || co.status !== "Draft") return false;
  const { error } = await c.from("project_change_order_items").delete().eq("id", itemId).eq("change_order_id", changeOrderId);
  if (error) return false;
  await recomputeChangeOrderTotal(c, changeOrderId);
  return true;
}

/**
 * Status flow: Draft → Pending Approval → Approved | Rejected.
 * Only Approved change orders affect revenue (canonical profit: amount or total added to project.budget).
 */
export async function updateChangeOrderStatus(
  changeOrderId: string,
  status: ChangeOrderStatus,
  options?: { approvedBy?: string | null }
): Promise<boolean> {
  const c = client();
  const co = await getChangeOrderById(changeOrderId);
  if (!co) return false;

  if (status === "Approved") {
    if (co.status === "Approved") return false;
    const payload: { p_change_order_id: string; p_approved_by?: string | null } = { p_change_order_id: changeOrderId };
    if (options?.approvedBy != null) payload.p_approved_by = options.approvedBy;
    const { error } = await c.rpc("approve_change_order", payload);
    if (error) {
      if (!isMissingFunction(error)) return false;
      // Fallback: direct status update.
      const updates: Record<string, unknown> = { status: "Approved", approved_at: new Date().toISOString() };
      if (options?.approvedBy != null) updates.approved_by = options.approvedBy;
      const { error: updErr } = await c.from("project_change_orders").update(updates).eq("id", changeOrderId);
      return !updErr;
    }
    return true;
  }

  if (status === "Rejected") {
    if (co.status !== "Pending Approval" && co.status !== "Draft") return false;
    const { error } = await c
      .from("project_change_orders")
      .update({ status: "Rejected", approved_at: null })
      .eq("id", changeOrderId);
    return !error;
  }

  if (status === "Pending Approval" && co.status === "Draft") {
    const { error } = await c.from("project_change_orders").update({ status: "Pending Approval" }).eq("id", changeOrderId);
    return !error;
  }

  if (status === "Draft" && (co.status === "Pending Approval" || co.status === "Rejected")) {
    const { error } = await c
      .from("project_change_orders")
      .update({ status: "Draft", approved_at: null, approved_by: null })
      .eq("id", changeOrderId);
    return !error;
  }

  return false;
}
