import * as expenseOpts from "@/lib/expense-options-db";
import { getSupabaseClient } from "@/lib/supabase";

export type PaymentAccountType = "card" | "cash" | "bank";

export type PaymentAccountRow = {
  id: string;
  name: string;
  type: PaymentAccountType;
  created_at: string;
};

export type PaymentAccountPickerRow = PaymentAccountRow & { archived?: boolean };

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

export async function getPaymentAccounts(): Promise<PaymentAccountRow[]> {
  const rows = await getPaymentAccountsForExpensePicker(null);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    created_at: r.created_at,
  }));
}

/** Active accounts for pickers; includes current selection even when archived. */
export async function getPaymentAccountsForExpensePicker(
  currentAccountId: string | null | undefined
): Promise<PaymentAccountPickerRow[]> {
  const c = client();
  const { data, error } = await c
    .from("payment_accounts")
    .select("id,name,type,created_at")
    .order("name");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payment accounts.");
  }
  const all = (data ?? []) as PaymentAccountRow[];
  const available = await expenseOpts.expenseOptionsTableAvailable();
  if (!available) return all.map((r) => ({ ...r, archived: false }));
  const optionRows = await expenseOpts.listExpenseOptionsByType("payment_account");
  if (optionRows.length === 0) return all.map((r) => ({ ...r, archived: false }));
  const activeKeys = await expenseOpts.activePaymentAccountIds();
  const cur = (currentAccountId ?? "").trim();
  return all
    .filter((r) => activeKeys.has(r.id) || (cur !== "" && r.id === cur))
    .map((r) => ({
      ...r,
      archived: !activeKeys.has(r.id),
    }));
}

/** Trim name; insert or return existing row (case-insensitive name match). */
export async function addPaymentAccount(
  name: string,
  type: PaymentAccountType
): Promise<PaymentAccountRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const c = client();
  const { data: existing } = await c
    .from("payment_accounts")
    .select("id,name,type,created_at")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) {
    const ex = existing as PaymentAccountRow;
    await expenseOpts.ensurePaymentAccountOptionRow(ex.id, ex.name);
    return ex;
  }
  const { data: row, error } = await c
    .from("payment_accounts")
    .insert({ name: trimmed, type })
    .select("id,name,type,created_at")
    .single();
  if (error) {
    const { data: again } = await c
      .from("payment_accounts")
      .select("id,name,type,created_at")
      .ilike("name", trimmed)
      .maybeSingle();
    if (again) {
      const ag = again as PaymentAccountRow;
      await expenseOpts.ensurePaymentAccountOptionRow(ag.id, ag.name);
      return ag;
    }
    console.warn("[addPaymentAccount]", error.message);
    return null;
  }
  const created = row as PaymentAccountRow;
  await expenseOpts.ensurePaymentAccountOptionRow(created.id, created.name);
  return created;
}
