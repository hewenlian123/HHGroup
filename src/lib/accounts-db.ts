/**
 * Accounts — payment sources (credit cards, debit cards, bank, cash).
 * Table: accounts.
 */

import { supabase } from "@/lib/supabase";

export type AccountType = "Credit Card" | "Debit Card" | "Bank" | "Cash" | "Other";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  lastFour: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function isMissingTable(err: { message?: string } | null): boolean {
  if (!err) return false;
  const m = String((err as { message?: string }).message ?? err).toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("relation") && m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("table") && m.includes("accounts")
  );
}

export async function getAccounts(): Promise<Account[]> {
  const c = client();
  try {
    const { data: rows, error } = await c
      .from("accounts")
      .select("id, name, type, last_four, notes, created_at, updated_at")
      .order("name");
    if (error) {
      if (isMissingTable(error)) return [];
      throw new Error(error.message ?? "Failed to load accounts.");
    }
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: (r.name as string) ?? "",
      type: (r.type as AccountType) ?? "Other",
      lastFour: (r.last_four as string)?.trim() || null,
      notes: (r.notes as string)?.trim() || null,
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/schema cache|table.*accounts|could not find|relation.*does not exist/i.test(msg)) return [];
    throw e;
  }
}

export async function createAccount(input: {
  name: string;
  type: AccountType;
  lastFour?: string | null;
  notes?: string | null;
}): Promise<Account> {
  const c = client();
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Account name is required.");
  const { data: row, error } = await c
    .from("accounts")
    .insert({
      name,
      type: input.type ?? "Other",
      last_four: (input.lastFour ?? "").trim() || null,
      notes: (input.notes ?? "").trim() || null,
    })
    .select("id, name, type, last_four, notes, created_at, updated_at")
    .single();
  if (error) {
    if (isMissingTable(error)) throw new Error("Accounts table not found. Run migration: supabase/migrations/202603190000_accounts.sql");
    throw new Error(error.message ?? "Failed to create account.");
  }
  return {
    id: row.id,
    name: row.name ?? "",
    type: (row.type as AccountType) ?? "Other",
    lastFour: (row.last_four as string)?.trim() || null,
    notes: (row.notes as string)?.trim() || null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

export async function updateAccount(
  id: string,
  patch: Partial<{ name: string; type: AccountType; lastFour: string | null; notes: string | null }>
): Promise<Account | null> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.name != null) updates.name = patch.name.trim();
  if (patch.type != null) updates.type = patch.type;
  if (patch.lastFour !== undefined) updates.last_four = patch.lastFour?.trim() || null;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (Object.keys(updates).length === 0) {
    const list = await getAccounts();
    return list.find((a) => a.id === id) ?? null;
  }
  const { data: row, error } = await c
    .from("accounts")
    .update(updates)
    .eq("id", id)
    .select("id, name, type, last_four, notes, created_at, updated_at")
    .single();
  if (error) {
    if (isMissingTable(error)) return null;
    return null;
  }
  return {
    id: row.id,
    name: row.name ?? "",
    type: (row.type as AccountType) ?? "Other",
    lastFour: (row.last_four as string)?.trim() || null,
    notes: (row.notes as string)?.trim() || null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

export async function deleteAccount(id: string): Promise<boolean> {
  const c = client();
  const { error } = await c.from("accounts").delete().eq("id", id);
  if (error && isMissingTable(error)) return false;
  return !error;
}
