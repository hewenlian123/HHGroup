/**
 * AP Bills module — ap_bills + ap_bill_payments. Internal payable tracking.
 */

import { getSupabaseClient } from "@/lib/supabase";

export const AP_BILL_TYPES = ["Vendor", "Labor", "Overhead", "Utility", "Permit", "Equipment", "Other"] as const;
export type ApBillType = (typeof AP_BILL_TYPES)[number];

export const AP_BILL_STATUSES = ["Draft", "Pending", "Partially Paid", "Paid", "Void"] as const;
export type ApBillStatus = (typeof AP_BILL_STATUSES)[number];

export type ApBillRow = {
  id: string;
  bill_no: string | null;
  bill_type: ApBillType;
  vendor_name: string;
  project_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number;
  paid_amount: number;
  balance_amount: number;
  status: ApBillStatus;
  category: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ApBillWithProject = ApBillRow & { project_name: string | null };

export type ApBillPaymentRow = {
  id: string;
  bill_id: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export type ApBillsFilters = {
  search?: string;
  status?: ApBillStatus;
  bill_type?: ApBillType;
  project_id?: string;
  date_from?: string;
  date_to?: string;
  overdue_only?: boolean;
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

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapBill(r: Record<string, unknown>): ApBillRow {
  return {
    id: (r.id as string) ?? "",
    bill_no: (r.bill_no as string | null) ?? null,
    bill_type: (r.bill_type as ApBillType) ?? "Vendor",
    vendor_name: (r.vendor_name as string) ?? "",
    project_id: (r.project_id as string | null) ?? null,
    issue_date: r.issue_date != null ? String(r.issue_date).slice(0, 10) : null,
    due_date: r.due_date != null ? String(r.due_date).slice(0, 10) : null,
    amount: toNum(r.amount),
    paid_amount: toNum(r.paid_amount),
    balance_amount: toNum(r.balance_amount),
    status: (r.status as ApBillStatus) ?? "Draft",
    category: (r.category as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    attachment_url: (r.attachment_url as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
    updated_at: (r.updated_at as string) ?? "",
    created_by: (r.created_by as string | null) ?? null,
  };
}

function mapPayment(r: Record<string, unknown>): ApBillPaymentRow {
  return {
    id: (r.id as string) ?? "",
    bill_id: (r.bill_id as string) ?? "",
    payment_date: r.payment_date != null ? String(r.payment_date).slice(0, 10) : "",
    amount: toNum(r.amount),
    payment_method: (r.payment_method as string | null) ?? null,
    reference_no: (r.reference_no as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
    created_by: (r.created_by as string | null) ?? null,
  };
}

/** Get one bill by id. */
export async function getApBillById(id: string): Promise<ApBillWithProject | null> {
  const c = client();
  const { data: row, error } = await c
    .from("ap_bills")
    .select("id, bill_no, bill_type, vendor_name, project_id, issue_date, due_date, amount, paid_amount, balance_amount, status, category, notes, attachment_url, created_at, updated_at, created_by, projects(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to load bill.");
  }
  if (!row) return null;
  const r = row as Record<string, unknown>;
  const proj = r.projects as { name?: string } | null;
  return { ...mapBill(r), project_name: proj?.name ?? null };
}

/** List ap_bills with optional filters and project name join. */
export async function getApBills(filters: ApBillsFilters = {}): Promise<ApBillWithProject[]> {
  const c = client();
  let q = c
    .from("ap_bills")
    .select("id, bill_no, bill_type, vendor_name, project_id, issue_date, due_date, amount, paid_amount, balance_amount, status, category, notes, attachment_url, created_at, updated_at, created_by, projects(name)")
    .order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.bill_type) q = q.eq("bill_type", filters.bill_type);
  if (filters.project_id) q = q.eq("project_id", filters.project_id);
  if (filters.date_from) q = q.gte("due_date", filters.date_from.slice(0, 10));
  if (filters.date_to) q = q.lte("due_date", filters.date_to.slice(0, 10));
  if (filters.overdue_only) {
    const today = new Date().toISOString().slice(0, 10);
    q = q.lt("due_date", today).neq("status", "Paid").neq("status", "Void");
  }

  const { data: rows, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load bills.");
  }
  let list = (rows ?? []).map((r: Record<string, unknown>) => {
    const proj = r.projects as { name?: string } | null;
    return { ...mapBill(r), project_name: proj?.name ?? null };
  });
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter(
      (b) =>
        (b.vendor_name ?? "").toLowerCase().includes(q) ||
        (b.bill_no ?? "").toLowerCase().includes(q) ||
        (b.category ?? "").toLowerCase().includes(q)
    );
  }
  return list;
}

/** Get bills by project (for project detail). */
export async function getApBillsByProject(projectId: string): Promise<ApBillWithProject[]> {
  return getApBills({ project_id: projectId });
}

/** Recent bills for dashboard activity feed. Ordered by created_at desc, limit. */
export async function getApBillsRecent(limit: number): Promise<ApBillWithProject[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("ap_bills")
    .select("id, bill_no, bill_type, vendor_name, project_id, issue_date, due_date, amount, paid_amount, balance_amount, status, category, notes, attachment_url, created_at, updated_at, created_by, projects(name)")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load recent bills.");
  }
  return (rows ?? []).map((r: Record<string, unknown>) => {
    const proj = r.projects as { name?: string } | null;
    return { ...mapBill(r), project_name: proj?.name ?? null };
  });
}

/** Get payments for a bill. */
export async function getApBillPayments(billId: string): Promise<ApBillPaymentRow[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("ap_bill_payments")
    .select("id, bill_id, payment_date, amount, payment_method, reference_no, notes, created_at, created_by")
    .eq("bill_id", billId)
    .order("payment_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payments.");
  }
  return (rows ?? []).map((r) => mapPayment(r as Record<string, unknown>));
}

/** Create a new bill. */
export async function createApBill(draft: {
  bill_no?: string | null;
  bill_type?: ApBillType;
  vendor_name: string;
  project_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  amount: number;
  category?: string | null;
  notes?: string | null;
}): Promise<ApBillRow> {
  const c = client();
  const vendorName = draft.vendor_name.trim();
  if (!vendorName) throw new Error("Vendor name is required");
  if (!(draft.amount > 0)) throw new Error("Amount must be greater than 0");
  const amount = draft.amount;
  const payload = {
    bill_no: draft.bill_no?.trim() || null,
    bill_type: AP_BILL_TYPES.includes(draft.bill_type!) ? draft.bill_type : "Vendor",
    vendor_name: vendorName,
    project_id: draft.project_id || null,
    issue_date: draft.issue_date?.slice(0, 10) || null,
    due_date: draft.due_date?.slice(0, 10) || null,
    amount,
    paid_amount: 0,
    balance_amount: amount,
    status: "Draft" as const,
    category: draft.category?.trim() || null,
    notes: draft.notes?.trim() || null,
  };
  const { data: row, error } = await c.from("ap_bills").insert(payload).select("*").single();
  if (error) {
    if (isMissingTable(error)) throw new Error("AP Bills table not found. Please run the ap_bills migration in Supabase.");
    throw new Error(error.message ?? "Failed to create bill.");
  }
  return mapBill(row as Record<string, unknown>);
}

/** Update bill (header only; amounts/status recomputed from payments). */
export async function updateApBill(
  id: string,
  patch: Partial<{
    bill_no: string | null;
    bill_type: ApBillType;
    vendor_name: string;
    project_id: string | null;
    issue_date: string | null;
    due_date: string | null;
    amount: number;
    category: string | null;
    notes: string | null;
    attachment_url: string | null;
    status: ApBillStatus;
  }>
): Promise<ApBillRow | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.bill_no !== undefined) updates.bill_no = patch.bill_no?.trim() || null;
  if (patch.bill_type !== undefined) updates.bill_type = AP_BILL_TYPES.includes(patch.bill_type) ? patch.bill_type : "Vendor";
  if (patch.vendor_name !== undefined) updates.vendor_name = patch.vendor_name.trim();
  if (patch.project_id !== undefined) updates.project_id = patch.project_id || null;
  if (patch.issue_date !== undefined) updates.issue_date = patch.issue_date?.slice(0, 10) || null;
  if (patch.due_date !== undefined) updates.due_date = patch.due_date?.slice(0, 10) || null;
  if (patch.amount !== undefined) updates.amount = Math.max(0, patch.amount);
  if (patch.category !== undefined) updates.category = patch.category?.trim() || null;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (patch.attachment_url !== undefined) updates.attachment_url = patch.attachment_url?.trim() || null;
  if (patch.status !== undefined) updates.status = AP_BILL_STATUSES.includes(patch.status) ? patch.status : "Draft";
  if (Object.keys(updates).length === 0) return getApBillById(id).then((b) => (b ? mapBill(b as unknown as Record<string, unknown>) : null));
  const { data: row, error } = await c.from("ap_bills").update(updates).eq("id", id).select("*").single();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to update bill.");
  }
  return mapBill(row as Record<string, unknown>);
}

/** Add a payment; trigger will recompute paid_amount, balance_amount, status. */
export async function addApBillPayment(billId: string, payment: {
  payment_date: string;
  amount: number;
  payment_method?: string | null;
  reference_no?: string | null;
  notes?: string | null;
}): Promise<ApBillPaymentRow> {
  const c = client();
  const amt = Math.max(0, payment.amount);
  const { data: row, error } = await c
    .from("ap_bill_payments")
    .insert({
      bill_id: billId,
      payment_date: payment.payment_date.slice(0, 10),
      amount: amt,
      payment_method: payment.payment_method?.trim() || null,
      reference_no: payment.reference_no?.trim() || null,
      notes: payment.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error) {
    if (isMissingTable(error)) throw new Error("AP Bill Payments table not found. Please run the ap_bills migration in Supabase.");
    throw new Error(error.message ?? "Failed to add payment.");
  }
  return mapPayment(row as Record<string, unknown>);
}

/** Mark bill as Pending (confirm). */
export async function setApBillPending(id: string): Promise<void> {
  const bill = await getApBillById(id);
  if (!bill || bill.status !== "Draft") return;
  await client().from("ap_bills").update({ status: "Pending" }).eq("id", id);
}

/** Mark bill as Void. */
export async function voidApBill(id: string): Promise<void> {
  await client().from("ap_bills").update({ status: "Void" }).eq("id", id);
}

/** Delete a Draft bill with no payments. */
export async function deleteApBillDraft(id: string): Promise<void> {
  const c = client();
  const { data: bill, error: billErr } = await c.from("ap_bills").select("id,status").eq("id", id).single();
  if (billErr) {
    if (isMissingTable(billErr)) return;
    throw new Error(billErr.message ?? "Failed to load bill.");
  }
  const status = ((bill as { status?: unknown })?.status ?? "").toString();
  if (status !== "Draft") throw new Error("Only Draft bills can be deleted");

  const { count, error: payErr } = await c
    .from("ap_bill_payments")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", id);
  if (payErr) throw new Error(payErr.message ?? "Failed to check bill payments.");
  if ((count ?? 0) > 0) throw new Error("Cannot delete a bill with payments");

  const { error: delErr } = await c.from("ap_bills").delete().eq("id", id);
  if (delErr) throw new Error(delErr.message ?? "Failed to delete bill.");
}

/** Total amount of all non-void bills (for finance overview). */
export async function getTotalBillsAmount(): Promise<number> {
  const c = client();
  const { data: rows, error } = await c
    .from("ap_bills")
    .select("amount")
    .not("status", "eq", "Void");
  if (error && isMissingTable(error)) return 0;
  if (error) throw new Error(error.message ?? "Failed to load bills.");
  return (rows ?? []).reduce((s, r) => s + toNum((r as { amount?: number }).amount), 0);
}

/** Summary stats for dashboard / list. */
export async function getApBillsSummary(): Promise<{
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  dueThisWeekCount: number;
  dueThisWeekAmount: number;
  paidThisMonthAmount: number;
}> {
  const c = client();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekStart = startOfWeek.toISOString().slice(0, 10);
  const weekEnd = endOfWeek.toISOString().slice(0, 10);
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: bills, error } = await c
    .from("ap_bills")
    .select("id, amount, paid_amount, balance_amount, status, due_date")
    .not("status", "eq", "Void");
  if (error) {
    // Table missing or other error — return zeroed summary rather than crashing.
    return { totalOutstanding: 0, overdueCount: 0, overdueAmount: 0, dueThisWeekCount: 0, dueThisWeekAmount: 0, paidThisMonthAmount: 0 };
  }
  const list = (bills ?? []) as Array<{ balance_amount?: number; due_date?: string | null; amount?: number; paid_amount?: number }>;

  let totalOutstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let dueThisWeekCount = 0;
  let dueThisWeekAmount = 0;

  for (const b of list) {
    const balance = toNum(b.balance_amount);
    totalOutstanding += balance;
    const due = b.due_date ?? "";
    if (due && balance > 0 && due < today) {
      overdueCount++;
      overdueAmount += balance;
    }
    if (due && balance > 0 && due >= weekStart && due <= weekEnd) {
      dueThisWeekCount++;
      dueThisWeekAmount += balance;
    }
  }

  const { data: payments } = await c
    .from("ap_bill_payments")
    .select("amount")
    .gte("payment_date", startOfMonth)
    .lte("payment_date", new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const paidThisMonthAmount = (payments ?? []).reduce((s, p) => s + toNum((p as { amount?: number }).amount), 0);

  return {
    totalOutstanding,
    overdueCount,
    overdueAmount,
    dueThisWeekCount,
    dueThisWeekAmount,
    paidThisMonthAmount,
  };
}
