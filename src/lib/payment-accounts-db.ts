import { getSupabaseClient } from "@/lib/supabase";

export type PaymentAccountType = "card" | "cash" | "bank";

export type PaymentAccountRow = {
  id: string;
  name: string;
  type: PaymentAccountType;
  created_at: string;
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

export async function getPaymentAccounts(): Promise<PaymentAccountRow[]> {
  const c = client();
  const { data, error } = await c
    .from("payment_accounts")
    .select("id,name,type,created_at")
    .order("name");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payment accounts.");
  }
  return (data ?? []) as PaymentAccountRow[];
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
  if (existing) return existing as PaymentAccountRow;
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
    if (again) return again as PaymentAccountRow;
    console.warn("[addPaymentAccount]", error.message);
    return null;
  }
  return row as PaymentAccountRow;
}
