/**
 * Project commissions and commission payment records.
 */

import { supabase } from "@/lib/supabase";

export type CommissionRole = "Designer" | "Sales" | "Referral" | "Agent" | "Other";
export type CalculationMode = "Auto" | "Manual";
export type CommissionStatus = "Pending" | "Approved" | "Paid" | "Cancelled";
export type PaymentMethod = "Check" | "Bank Transfer" | "Cash" | "Zelle" | "Other";

export type ProjectCommission = {
  id: string;
  project_id: string;
  person_name: string;
  role: string;
  calculation_mode: CalculationMode;
  rate: number;
  base_amount: number;
  commission_amount: number;
  status: CommissionStatus;
  notes: string | null;
  created_at: string;
};

export type CommissionPaymentRecord = {
  id: string;
  commission_id: string;
  project_id: string;
  person_name: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
};

export type CommissionWithPaid = ProjectCommission & {
  paid_amount: number;
  outstanding_amount: number;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const COLS =
  "id, project_id, person_name, role, calculation_mode, rate, base_amount, commission_amount, status, notes, created_at";

function toCommission(r: Record<string, unknown>): ProjectCommission {
  return {
    id: String(r.id ?? ""),
    project_id: String(r.project_id ?? ""),
    person_name: String(r.person_name ?? ""),
    role: String(r.role ?? "Other"),
    calculation_mode: (r.calculation_mode === "Manual" ? "Manual" : "Auto") as CalculationMode,
    rate: Number(r.rate) || 0,
    base_amount: Number(r.base_amount) || 0,
    commission_amount: Number(r.commission_amount) || 0,
    status: (r.status === "Approved" || r.status === "Paid" || r.status === "Cancelled" ? r.status : "Pending") as CommissionStatus,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? "").slice(0, 19),
  };
}

export async function getCommissionsByProject(projectId: string): Promise<ProjectCommission[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_commissions")
    .select(COLS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load commissions.");
  return (rows ?? []).map((r) => toCommission(r as Record<string, unknown>));
}

export async function createCommission(
  projectId: string,
  data: {
    person_name: string;
    role: string;
    calculation_mode: CalculationMode;
    rate: number;
    base_amount: number;
    commission_amount: number;
    status: CommissionStatus;
    notes?: string | null;
  }
): Promise<ProjectCommission> {
  const c = client();
  const commissionAmount =
    data.calculation_mode === "Auto"
      ? Math.round(data.base_amount * data.rate * 100) / 100
      : data.commission_amount;
  const { data: row, error } = await c
    .from("project_commissions")
    .insert({
      project_id: projectId,
      person_name: data.person_name.trim() || "",
      role: data.role || "Other",
      calculation_mode: data.calculation_mode || "Auto",
      rate: Math.max(0, data.rate),
      base_amount: Math.max(0, data.base_amount),
      commission_amount: Math.max(0, commissionAmount),
      status: data.status || "Pending",
      notes: data.notes?.trim() || null,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to create commission.");
  return toCommission(row as Record<string, unknown>);
}

export async function updateCommission(
  id: string,
  data: Partial<{
    person_name: string;
    role: string;
    calculation_mode: CalculationMode;
    rate: number;
    base_amount: number;
    commission_amount: number;
    status: CommissionStatus;
    notes: string | null;
  }>
): Promise<ProjectCommission | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (data.person_name !== undefined) updates.person_name = data.person_name.trim() || "";
  if (data.role !== undefined) updates.role = data.role || "Other";
  if (data.calculation_mode !== undefined) updates.calculation_mode = data.calculation_mode;
  if (data.rate !== undefined) updates.rate = Math.max(0, data.rate);
  if (data.base_amount !== undefined) updates.base_amount = Math.max(0, data.base_amount);
  if (data.status !== undefined) updates.status = data.status;
  if (data.notes !== undefined) updates.notes = data.notes?.trim() || null;
  if (data.commission_amount !== undefined) updates.commission_amount = Math.max(0, data.commission_amount);
  if (data.calculation_mode === "Auto" && data.base_amount !== undefined && data.rate !== undefined) {
    updates.commission_amount = Math.round(data.base_amount * data.rate * 100) / 100;
  }
  if (Object.keys(updates).length === 0) return getCommissionById(id);
  const { data: row, error } = await c
    .from("project_commissions")
    .update(updates)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) return null;
  return toCommission(row as Record<string, unknown>);
}

export async function getCommissionById(id: string): Promise<ProjectCommission | null> {
  const c = client();
  const { data: row, error } = await c.from("project_commissions").select(COLS).eq("id", id).maybeSingle();
  if (error || !row) return null;
  return toCommission(row as Record<string, unknown>);
}

export async function deleteCommission(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("project_commissions").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete commission.");
}

const PAYMENT_COLS =
  "id, commission_id, project_id, person_name, amount, payment_date, payment_method, reference_no, notes, created_at";

function toPaymentRecord(r: Record<string, unknown>): CommissionPaymentRecord {
  return {
    id: String(r.id ?? ""),
    commission_id: String(r.commission_id ?? ""),
    project_id: String(r.project_id ?? ""),
    person_name: String(r.person_name ?? ""),
    amount: Number(r.amount) || 0,
    payment_date: String(r.payment_date ?? "").slice(0, 10),
    payment_method: String(r.payment_method ?? "Other"),
    reference_no: r.reference_no != null ? String(r.reference_no) : null,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? ""),
  };
}

export async function getPaymentRecordsByCommissionId(commissionId: string): Promise<CommissionPaymentRecord[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("commission_payment_records")
    .select(PAYMENT_COLS)
    .eq("commission_id", commissionId)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load payment records.");
  return (rows ?? []).map((r) => toPaymentRecord(r as Record<string, unknown>));
}

export async function createPaymentRecord(data: {
  commission_id: string;
  project_id: string;
  person_name: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_no?: string | null;
  notes?: string | null;
}): Promise<CommissionPaymentRecord> {
  const c = client();
  const { data: row, error } = await c
    .from("commission_payment_records")
    .insert({
      commission_id: data.commission_id,
      project_id: data.project_id,
      person_name: data.person_name.trim() || "",
      amount: Math.max(0, data.amount),
      payment_date: data.payment_date.slice(0, 10),
      payment_method: data.payment_method || "Other",
      reference_no: data.reference_no?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .select(PAYMENT_COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to record payment.");
  return toPaymentRecord(row as Record<string, unknown>);
}

export async function getAllCommissionsWithPayments(): Promise<CommissionWithPaid[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("project_commissions")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load commissions.");
  const commissions = (rows ?? []).map((r) => toCommission(r as Record<string, unknown>));
  const ids = commissions.map((c) => c.id);
  if (ids.length === 0) return [];
  const { data: payments } = await c
    .from("commission_payment_records")
    .select("commission_id, amount")
    .in("commission_id", ids);
  const paidByCommission = new Map<string, number>();
  for (const p of payments ?? []) {
    const id = (p as { commission_id: string }).commission_id;
    const amt = Number((p as { amount: number }).amount) || 0;
    paidByCommission.set(id, (paidByCommission.get(id) ?? 0) + amt);
  }
  return commissions.map((com) => {
    const paid = paidByCommission.get(com.id) ?? 0;
    return {
      ...com,
      paid_amount: paid,
      outstanding_amount: Math.max(0, com.commission_amount - paid),
    };
  });
}

export async function getCommissionSummary(): Promise<{
  totalCommission: number;
  paidCommission: number;
  outstandingCommission: number;
  thisMonthPaid: number;
}> {
  const all = await getAllCommissionsWithPayments();
  const totalCommission = all.reduce((s, c) => s + c.commission_amount, 0);
  const paidCommission = all.reduce((s, c) => s + c.paid_amount, 0);
  const outstandingCommission = all.reduce((s, c) => s + c.outstanding_amount, 0);
  const c = client();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthStart = startOfMonth.toISOString().slice(0, 10);
  const { data: monthPayments } = await c
    .from("commission_payment_records")
    .select("amount")
    .gte("payment_date", monthStart);
  const thisMonthPaid = (monthPayments ?? []).reduce((s, p) => s + (Number((p as { amount: number }).amount) || 0), 0);
  return {
    totalCommission,
    paidCommission,
    outstandingCommission,
    thisMonthPaid,
  };
}
