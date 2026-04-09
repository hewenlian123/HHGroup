/**
 * Deposits — table: deposits (migration 202603201100_deposits.sql).
 * DB: deposit_account, deposit_date, customer_name, invoice_id, payment_method, …
 * UI row: account, date, description (mapped from customer_name).
 */

import { getSupabaseClient } from "@/lib/supabase";

export type DepositRow = {
  id: string;
  payment_id: string;
  amount: number;
  account: string | null;
  date: string;
  description: string | null;
  project_id: string | null;
  created_at: string;
};

type DepositsDbRow = {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  deposit_account: string | null;
  deposit_date: string;
  customer_name: string;
  project_id: string | null;
  payment_method: string | null;
  status?: string | null;
  created_at: string;
};

export type DepositWithMeta = DepositRow & {
  invoice_no: string | null;
  project_name: string | null;
  payment_method: string | null;
};

function mapDepositDbRow(r: DepositsDbRow): DepositRow {
  const depDate =
    typeof r.deposit_date === "string" ? r.deposit_date.slice(0, 10) : String(r.deposit_date ?? "");
  return {
    id: r.id,
    payment_id: r.payment_id,
    amount: Number(r.amount) || 0,
    account: r.deposit_account,
    date: depDate,
    description: r.customer_name?.trim() ? r.customer_name : null,
    project_id: r.project_id,
    created_at: r.created_at,
  };
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /relation.*does not exist|table.*does not exist|could not find/i.test(m);
}

/** List all deposits. Newest first. */
export async function getDeposits(): Promise<DepositWithMeta[]> {
  const c = client();
  const selectWithStatus =
    "id, payment_id, invoice_id, amount, deposit_account, deposit_date, customer_name, project_id, payment_method, status, created_at";
  const selectWithoutStatus =
    "id, payment_id, invoice_id, amount, deposit_account, deposit_date, customer_name, project_id, payment_method, created_at";

  // Prefer filtering out voided deposits when status column exists.
  let rows: unknown[] | null = null;
  let error: { message?: string } | null = null;
  {
    const r = await c
      .from("deposits")
      .select(selectWithStatus)
      .neq("status", "void")
      .order("deposit_date", { ascending: false });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (error && /column .* does not exist|schema cache/i.test(error.message ?? "")) {
    const r = await c.from("deposits").select(selectWithoutStatus).order("deposit_date", {
      ascending: false,
    });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load deposits.");
  }
  const raw = (rows ?? []) as DepositsDbRow[];
  if (raw.length === 0) return [];
  const projectIds = Array.from(new Set(raw.map((r) => r.project_id).filter(Boolean))) as string[];
  const invoiceIds = Array.from(new Set(raw.map((r) => r.invoice_id).filter(Boolean))) as string[];
  const [projRes, invRes] = await Promise.all([
    projectIds.length
      ? c.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? c.from("invoices").select("id, invoice_no").in("id", invoiceIds)
      : Promise.resolve({ data: [] }),
  ]);
  const projectNameById = new Map(
    (projRes.data ?? []).map((r: { id: string; name?: string }) => [r.id, r.name ?? null])
  );
  const invoiceNoById = new Map(
    (invRes.data ?? []).map((r: { id: string; invoice_no?: string }) => [
      r.id,
      r.invoice_no ?? null,
    ])
  );
  return raw.map((r) => {
    const base = mapDepositDbRow(r);
    return {
      ...base,
      invoice_no: invoiceNoById.get(r.invoice_id) ?? null,
      project_name: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
      payment_method: r.payment_method ?? null,
    };
  });
}

/** Deposits linked to an invoice (via invoice_id). */
export async function getDepositsByInvoiceId(invoiceId: string): Promise<DepositRow[]> {
  const c = client();
  const selectWithStatus =
    "id, payment_id, invoice_id, amount, deposit_account, deposit_date, customer_name, project_id, payment_method, status, created_at";
  const selectWithoutStatus =
    "id, payment_id, invoice_id, amount, deposit_account, deposit_date, customer_name, project_id, payment_method, created_at";

  let rows: unknown[] | null = null;
  let error: { message?: string } | null = null;
  {
    const r = await c
      .from("deposits")
      .select(selectWithStatus)
      .eq("invoice_id", invoiceId)
      .neq("status", "void")
      .order("deposit_date", { ascending: false });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (error && /column .* does not exist|schema cache/i.test(error.message ?? "")) {
    const r = await c
      .from("deposits")
      .select(selectWithoutStatus)
      .eq("invoice_id", invoiceId)
      .order("deposit_date", { ascending: false });
    rows = r.data as unknown[] | null;
    error = r.error as { message?: string } | null;
  }
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load deposits.");
  }
  return ((rows ?? []) as DepositsDbRow[]).map(mapDepositDbRow);
}

/** Sum of deposits.amount (Cash In for dashboard). */
export async function getTotalDepositsAmount(): Promise<number> {
  const c = client();
  const { data: rows, error } = await c.from("deposits").select("amount");
  if (error || !rows) return 0;
  return (rows as { amount: number }[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

/** Insert row matching public.deposits (invoice_id required by FK). */
export async function createDepositFromPayment(payment: {
  id: string;
  invoice_id: string;
  project_id?: string | null;
  amount: number;
  payment_date?: string;
  deposit_account?: string | null;
  customer_name: string;
  payment_method?: string | null;
}): Promise<DepositRow | null> {
  const c = client();
  // Guard: one non-void deposit per payment_id.
  const existing = await c
    .from("deposits")
    .select("id, status")
    .eq("payment_id", payment.id)
    .limit(1);
  if (existing.error && !isMissingTable(existing.error as { message?: string })) {
    throw new Error(existing.error.message ?? "Failed to check deposits.");
  }
  const exRow = (existing.data ?? [])[0] as { id?: string; status?: string | null } | undefined;
  if (exRow?.id && String(exRow.status ?? "recorded") !== "void") {
    // DB trigger `auto_create_deposit` may already have inserted this row; treat as success.
    {
      const r = await c
        .from("deposits")
        .select(
          "id, payment_id, invoice_id, amount, deposit_account, deposit_date, customer_name, project_id, payment_method, status, created_at"
        )
        .eq("payment_id", payment.id)
        .maybeSingle();
      if (!r.error && r.data) return mapDepositDbRow(r.data as DepositsDbRow);
    }
    {
      const r = await c
        .from("deposits")
        .select(
          "id, payment_id, invoice_id, amount, deposit_account, deposit_date, customer_name, project_id, payment_method, created_at"
        )
        .eq("payment_id", payment.id)
        .maybeSingle();
      if (!r.error && r.data) return mapDepositDbRow(r.data as DepositsDbRow);
    }
    return null;
  }

  const depositDate = payment.payment_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const { data: row, error } = await c
    .from("deposits")
    .insert({
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      amount: payment.amount,
      project_id: payment.project_id ?? null,
      customer_name: payment.customer_name?.trim() || "",
      deposit_account: payment.deposit_account ?? null,
      payment_method: payment.payment_method ?? null,
      deposit_date: depositDate,
      status: "recorded",
    })
    .select(
      "id, payment_id, invoice_id, amount, deposit_account, deposit_date, customer_name, project_id, payment_method, status, created_at"
    )
    .single();
  if (error) return null;
  return mapDepositDbRow(row as DepositsDbRow);
}
