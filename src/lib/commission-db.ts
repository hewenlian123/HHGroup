/**
 * Commissions (`commissions`) and payment rows (`commission_payments`).
 * paid_amount is always SUM(commission_payments.amount); never stored on the commission row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, humanizeSupabaseRequestError } from "@/lib/supabase";

export type CommissionRole = "Designer" | "Sales" | "Referral" | "Agent" | "Other";
export type CalculationMode = "Auto" | "Manual";
/** Derived from payments vs commission_amount (not stored in DB). */
export type CommissionPaymentStatus = "unpaid" | "partial" | "paid";

export type ProjectCommission = {
  id: string;
  project_id: string;
  person_id: string | null;
  person_name: string;
  role: string;
  calculation_mode: CalculationMode;
  rate: number;
  base_amount: number;
  commission_amount: number;
  notes: string | null;
  created_at: string;
};

export type CommissionPayment = {
  id: string;
  commission_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  note: string | null;
  /** Public Storage URL for uploaded receipt (jpg/png/pdf). */
  receipt_url: string | null;
  created_at: string;
};

/** @deprecated Use CommissionPayment */
export type CommissionPaymentRecord = CommissionPayment;

export type CommissionWithPaid = ProjectCommission & {
  paid_amount: number;
  outstanding_amount: number;
  payment_status: CommissionPaymentStatus;
};

const TABLE_COMMISSIONS = "commissions";
const TABLE_PAYMENTS = "commission_payments";
/** Legacy module (some DBs still hold rows here until backfill runs). */
const LEGACY_COMMISSIONS = "project_commissions";
const LEGACY_PAYMENTS = "commission_payment_records";
const LEGACY_COMMISSION_COLS =
  "id, project_id, person_name, role, calculation_mode, rate, base_amount, commission_amount, notes, created_at";

const COMMISSION_COLS =
  "id, project_id, person_id, person, role, calculation_mode, rate, base_amount, commission_amount, notes, created_at";

/** `*` avoids PostgREST errors when optional columns (e.g. receipt_url) are missing on older DBs. */
const PAYMENT_SELECT = "*";

export function deriveCommissionPaymentStatus(
  paidAmount: number,
  commissionAmount: number
): CommissionPaymentStatus {
  const tol = 1e-6;
  if (paidAmount <= tol) return "unpaid";
  if (paidAmount >= commissionAmount - tol) return "paid";
  return "partial";
}

export function summarizeCommissions(commissions: CommissionWithPaid[]): {
  totalCommission: number;
  paidCommission: number;
  outstandingCommission: number;
} {
  return {
    totalCommission: commissions.reduce((s, c) => s + c.commission_amount, 0),
    paidCommission: commissions.reduce((s, c) => s + c.paid_amount, 0),
    outstandingCommission: commissions.reduce((s, c) => s + c.outstanding_amount, 0),
  };
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function toCommission(r: Record<string, unknown>): ProjectCommission {
  return {
    id: String(r.id ?? ""),
    project_id: String(r.project_id ?? ""),
    person_id: r.person_id != null && String(r.person_id) !== "" ? String(r.person_id) : null,
    person_name: String(r.person ?? r.person_name ?? ""),
    role: String(r.role ?? "Other"),
    calculation_mode: (String(r.calculation_mode).toLowerCase() === "manual"
      ? "Manual"
      : "Auto") as CalculationMode,
    rate: Number(r.rate) || 0,
    base_amount: Number(r.base_amount) || 0,
    commission_amount: Number(r.commission_amount) || 0,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? "").slice(0, 19),
  };
}

function toPaymentRow(r: Record<string, unknown>): CommissionPayment {
  const noteCol = r.note ?? r.notes;
  const receiptRaw = r.receipt_url;
  return {
    id: String(r.id ?? ""),
    commission_id: String(r.commission_id ?? ""),
    amount: Number(r.amount) || 0,
    payment_date: String(r.payment_date ?? "").slice(0, 10),
    payment_method: String(r.payment_method ?? "Other"),
    note: noteCol != null ? String(noteCol) : null,
    receipt_url:
      receiptRaw != null && String(receiptRaw).trim() !== "" ? String(receiptRaw).trim() : null,
    created_at: String(r.created_at ?? ""),
  };
}

function toPaymentRowFromLegacyRecord(r: Record<string, unknown>): CommissionPayment {
  const notes = r.notes != null ? String(r.notes).trim() : "";
  const ref = r.reference_no != null ? String(r.reference_no).trim() : "";
  let note: string | null = null;
  if (ref && notes) note = `${notes}\nRef: ${ref}`;
  else if (ref) note = `Ref: ${ref}`;
  else if (notes) note = notes;
  return {
    id: String(r.id ?? ""),
    commission_id: String(r.commission_id ?? ""),
    amount: Number(r.amount) || 0,
    payment_date: String(r.payment_date ?? "").slice(0, 10),
    payment_method: String(r.payment_method ?? "Other"),
    note,
    receipt_url: null,
    created_at: String(r.created_at ?? ""),
  };
}

async function fetchLegacyCommissions(
  c: SupabaseClient,
  projectId?: string
): Promise<ProjectCommission[]> {
  let q = c
    .from(LEGACY_COMMISSIONS)
    .select(LEGACY_COMMISSION_COLS)
    .order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r) => toCommission(r as Record<string, unknown>));
}

/** Canonical rows from `commissions`; legacy-only rows from `project_commissions` (same id not duplicated). */
async function loadCommissionsMerged(projectId?: string): Promise<{ merged: ProjectCommission[] }> {
  const c = client();
  let q = c
    .from(TABLE_COMMISSIONS)
    .select(COMMISSION_COLS)
    .order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data: rows, error } = await q;
  if (error) throw new Error(humanizeSupabaseRequestError(error));
  const canonical = (rows ?? []).map((r) => toCommission(r as Record<string, unknown>));
  const canonicalIds = new Set(canonical.map((x) => x.id));
  const legacy = await fetchLegacyCommissions(c, projectId);
  const extra = legacy.filter((x) => x.id && !canonicalIds.has(x.id));
  const merged = [...canonical, ...extra];
  if (!projectId) {
    merged.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return { merged };
}

export async function getSumPaidForCommission(commissionId: string): Promise<number> {
  const c = client();
  const { data: rows, error } = await c
    .from(TABLE_PAYMENTS)
    .select("amount")
    .eq("commission_id", commissionId);
  if (error) throw new Error(humanizeSupabaseRequestError(error));
  const fromNew = (rows ?? []).reduce(
    (s, p) => s + (Number((p as { amount: number }).amount) || 0),
    0
  );
  if (fromNew > 0) return fromNew;
  const { data: leg, error: legErr } = await c
    .from(LEGACY_PAYMENTS)
    .select("amount")
    .eq("commission_id", commissionId);
  if (legErr) return 0;
  return (leg ?? []).reduce((s, p) => s + (Number((p as { amount: number }).amount) || 0), 0);
}

export async function getCommissionsByProject(projectId: string): Promise<ProjectCommission[]> {
  const { merged } = await loadCommissionsMerged(projectId);
  return merged;
}

export async function attachPaidTotalsToCommissions(
  commissions: ProjectCommission[]
): Promise<CommissionWithPaid[]> {
  if (commissions.length === 0) return [];
  const c = client();
  const ids = commissions.map((x) => x.id);
  const { data: payments, error: paymentsError } = await c
    .from(TABLE_PAYMENTS)
    .select("commission_id, amount")
    .in("commission_id", ids);
  if (paymentsError) {
    console.error(
      "[commission-db] commission_payments query failed; showing commissions with paid_amount=0",
      humanizeSupabaseRequestError(paymentsError)
    );
    return commissions.map((com) => {
      const paidRaw = 0;
      return {
        ...com,
        paid_amount: paidRaw,
        outstanding_amount: Math.max(0, com.commission_amount - paidRaw),
        payment_status: deriveCommissionPaymentStatus(paidRaw, com.commission_amount),
      };
    });
  }
  const paidByCommission = new Map<string, number>();
  const hasNewPaymentRow = new Set<string>();
  for (const p of payments ?? []) {
    const id = (p as { commission_id: string }).commission_id;
    if (id == null) continue;
    hasNewPaymentRow.add(id);
    const amt = Number((p as { amount: number }).amount) || 0;
    paidByCommission.set(id, (paidByCommission.get(id) ?? 0) + amt);
  }

  const { data: legacyPay } = await c
    .from(LEGACY_PAYMENTS)
    .select("commission_id, amount")
    .in("commission_id", ids);
  for (const p of legacyPay ?? []) {
    const id = (p as { commission_id: string }).commission_id;
    if (id == null) continue;
    if (hasNewPaymentRow.has(id)) continue;
    const amt = Number((p as { amount: number }).amount) || 0;
    paidByCommission.set(id, (paidByCommission.get(id) ?? 0) + amt);
  }

  return commissions.map((com) => {
    const paidRaw = paidByCommission.get(com.id) ?? 0;
    return {
      ...com,
      paid_amount: paidRaw,
      outstanding_amount: Math.max(0, com.commission_amount - paidRaw),
      payment_status: deriveCommissionPaymentStatus(paidRaw, com.commission_amount),
    };
  });
}

export async function getCommissionsWithPaidByProject(
  projectId: string
): Promise<CommissionWithPaid[]> {
  const { merged } = await loadCommissionsMerged(projectId);
  return attachPaidTotalsToCommissions(merged);
}

export async function createCommission(
  projectId: string,
  data: {
    person_name: string;
    person_id?: string | null;
    role: string;
    calculation_mode: CalculationMode;
    rate: number;
    base_amount: number;
    commission_amount: number;
    notes?: string | null;
  }
): Promise<ProjectCommission> {
  const c = client();
  const commissionAmount =
    data.calculation_mode === "Auto"
      ? Math.round(data.base_amount * data.rate * 100) / 100
      : data.commission_amount;
  const { data: row, error } = await c
    .from(TABLE_COMMISSIONS)
    .insert({
      project_id: projectId,
      person_id: data.person_id?.trim() || null,
      person: data.person_name.trim() || "",
      role: data.role || "Other",
      calculation_mode: data.calculation_mode || "Auto",
      rate: Math.max(0, data.rate),
      base_amount: Math.max(0, data.base_amount),
      commission_amount: Math.max(0, commissionAmount),
      notes: data.notes?.trim() || null,
    })
    .select(COMMISSION_COLS)
    .single();
  if (error) throw new Error(humanizeSupabaseRequestError(error));
  return toCommission(row as Record<string, unknown>);
}

export async function updateCommission(
  id: string,
  data: Partial<{
    person_name: string;
    person_id: string | null;
    role: string;
    calculation_mode: CalculationMode;
    rate: number;
    base_amount: number;
    commission_amount: number;
    notes: string | null;
  }>
): Promise<ProjectCommission | null> {
  const c = client();
  const existing = await getCommissionById(id);
  if (!existing) return null;

  const updates: Record<string, unknown> = {};
  if (data.person_name !== undefined) updates.person = data.person_name.trim() || "";
  if (data.person_id !== undefined) updates.person_id = data.person_id?.trim() || null;
  if (data.role !== undefined) updates.role = data.role || "Other";
  if (data.calculation_mode !== undefined) updates.calculation_mode = data.calculation_mode;
  if (data.rate !== undefined) updates.rate = Math.max(0, data.rate);
  if (data.base_amount !== undefined) updates.base_amount = Math.max(0, data.base_amount);
  if (data.notes !== undefined) updates.notes = data.notes?.trim() || null;
  if (data.commission_amount !== undefined)
    updates.commission_amount = Math.max(0, data.commission_amount);
  if (
    data.calculation_mode === "Auto" &&
    data.base_amount !== undefined &&
    data.rate !== undefined
  ) {
    updates.commission_amount = Math.round(data.base_amount * data.rate * 100) / 100;
  }

  if ("commission_amount" in updates) {
    const paid = await getSumPaidForCommission(id);
    if (Number(updates.commission_amount) + 1e-6 < paid) {
      throw new Error("Commission amount cannot be less than total payments already recorded.");
    }
  }

  if (Object.keys(updates).length === 0) return existing;
  const { data: row, error } = await c
    .from(TABLE_COMMISSIONS)
    .update(updates)
    .eq("id", id)
    .select(COMMISSION_COLS)
    .single();
  if (error) return null;
  return toCommission(row as Record<string, unknown>);
}

export async function getCommissionById(id: string): Promise<ProjectCommission | null> {
  const c = client();
  const { data: row, error } = await c
    .from(TABLE_COMMISSIONS)
    .select(COMMISSION_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(humanizeSupabaseRequestError(error));
  if (row) return toCommission(row as Record<string, unknown>);
  const { data: leg, error: legErr } = await c
    .from(LEGACY_COMMISSIONS)
    .select(LEGACY_COMMISSION_COLS)
    .eq("id", id)
    .maybeSingle();
  if (legErr || !leg) return null;
  return toCommission(leg as Record<string, unknown>);
}

export async function deleteCommission(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from(TABLE_COMMISSIONS).delete().eq("id", id);
  if (error) throw new Error(humanizeSupabaseRequestError(error));
}

export async function getPaymentRecordsByCommissionId(
  commissionId: string
): Promise<CommissionPayment[]> {
  const c = client();
  const { data: rows, error } = await c
    .from(TABLE_PAYMENTS)
    .select(PAYMENT_SELECT)
    .eq("commission_id", commissionId)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(humanizeSupabaseRequestError(error));
  const fromNew = (rows ?? []).map((r) => toPaymentRow(r as Record<string, unknown>));
  if (fromNew.length > 0) return fromNew;
  const { data: leg, error: legErr } = await c
    .from(LEGACY_PAYMENTS)
    .select("*")
    .eq("commission_id", commissionId)
    .order("payment_date", { ascending: false });
  if (legErr) return [];
  return (leg ?? []).map((r) => toPaymentRowFromLegacyRecord(r as Record<string, unknown>));
}

export async function getPaymentRecordById(id: string): Promise<CommissionPayment | null> {
  const c = client();
  const { data: row, error } = await c
    .from(TABLE_PAYMENTS)
    .select(PAYMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  if (row) return toPaymentRow(row as Record<string, unknown>);
  const { data: leg, error: legErr } = await c
    .from(LEGACY_PAYMENTS)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (legErr || !leg) return null;
  return toPaymentRowFromLegacyRecord(leg as Record<string, unknown>);
}

export async function updatePaymentRecord(
  id: string,
  data: Partial<{
    amount: number;
    payment_date: string;
    payment_method: string;
    note: string | null;
    receipt_url: string | null;
  }>
): Promise<CommissionPayment | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (data.amount !== undefined) updates.amount = Math.max(0, data.amount);
  if (data.payment_date !== undefined) updates.payment_date = data.payment_date.slice(0, 10);
  if (data.payment_method !== undefined) updates.payment_method = data.payment_method || "Other";
  if (data.note !== undefined) updates.note = data.note?.trim() || null;
  if (data.receipt_url !== undefined)
    updates.receipt_url =
      data.receipt_url != null && String(data.receipt_url).trim() !== ""
        ? String(data.receipt_url).trim()
        : null;
  if (Object.keys(updates).length === 0) return getPaymentRecordById(id);
  const { data: row, error } = await c
    .from(TABLE_PAYMENTS)
    .update(updates)
    .eq("id", id)
    .select(PAYMENT_SELECT)
    .single();
  if (error) return null;
  return toPaymentRow(row as Record<string, unknown>);
}

export async function deletePaymentRecord(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from(TABLE_PAYMENTS).delete().eq("id", id);
  if (error) throw new Error(humanizeSupabaseRequestError(error));
}

export async function createPaymentRecord(data: {
  commission_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  note?: string | null;
}): Promise<CommissionPayment> {
  const com = await getCommissionById(data.commission_id);
  if (!com) throw new Error("Commission not found.");
  const paid = await getSumPaidForCommission(data.commission_id);
  if (paid + data.amount > com.commission_amount + 1e-6) {
    throw new Error("Total payments cannot exceed the commission amount.");
  }
  const c = client();
  const { data: row, error } = await c
    .from(TABLE_PAYMENTS)
    .insert({
      commission_id: data.commission_id,
      amount: Math.max(0, data.amount),
      payment_date: data.payment_date.slice(0, 10),
      payment_method: data.payment_method || "Other",
      note: data.note?.trim() || null,
    })
    .select(PAYMENT_SELECT)
    .single();
  if (error) throw new Error(humanizeSupabaseRequestError(error));
  return toPaymentRow(row as Record<string, unknown>);
}

export async function getAllCommissionsWithPayments(): Promise<CommissionWithPaid[]> {
  const { merged } = await loadCommissionsMerged();
  return attachPaidTotalsToCommissions(merged);
}

export async function getCommissionSummary(): Promise<{
  totalCommission: number;
  paidCommission: number;
  outstandingCommission: number;
  thisMonthPaid: number;
}> {
  const c = client();
  const { merged } = await loadCommissionsMerged();
  const totalCommission = merged.reduce((s, r) => s + r.commission_amount, 0);
  const ids = merged.map((m) => m.id);
  if (ids.length === 0) {
    return {
      totalCommission: 0,
      paidCommission: 0,
      outstandingCommission: 0,
      thisMonthPaid: 0,
    };
  }

  const { data: payRows, error: pErr } = await c
    .from(TABLE_PAYMENTS)
    .select("amount, payment_date, commission_id")
    .in("commission_id", ids);
  if (pErr) throw new Error(humanizeSupabaseRequestError(pErr));

  const hasNewPaymentRow = new Set<string>();
  for (const p of payRows ?? []) {
    const cid = (p as { commission_id: string }).commission_id;
    if (cid) hasNewPaymentRow.add(cid);
  }

  const { data: legPayRows } = await c
    .from(LEGACY_PAYMENTS)
    .select("amount, payment_date, commission_id")
    .in("commission_id", ids);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthStart = startOfMonth.toISOString().slice(0, 10);

  let paidCommission = 0;
  let thisMonthPaid = 0;
  for (const p of payRows ?? []) {
    const row = p as { amount: number; payment_date: string | null };
    const amt = Number(row.amount) || 0;
    paidCommission += amt;
    const d = row.payment_date ? String(row.payment_date).slice(0, 10) : "";
    if (d >= monthStart) thisMonthPaid += amt;
  }
  for (const p of legPayRows ?? []) {
    const row = p as { amount: number; payment_date: string | null; commission_id: string };
    if (hasNewPaymentRow.has(row.commission_id)) continue;
    const amt = Number(row.amount) || 0;
    paidCommission += amt;
    const d = row.payment_date ? String(row.payment_date).slice(0, 10) : "";
    if (d >= monthStart) thisMonthPaid += amt;
  }

  const outstandingCommission = Math.max(0, totalCommission - paidCommission);

  return {
    totalCommission,
    paidCommission,
    outstandingCommission,
    thisMonthPaid,
  };
}
