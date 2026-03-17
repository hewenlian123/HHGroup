"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { AccountType } from "@/lib/accounts-db";

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  lastFour?: string | null;
  notes?: string | null;
};

export async function createAccountAction(
  input: CreateAccountInput
): Promise<{ data?: { id: string; name: string }; error?: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "You must be signed in to create an account." };
  }
  const name = (input.name ?? "").trim();
  if (!name) {
    return { error: "Account name is required." };
  }
  const { data: row, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name,
      type: input.type ?? "Other",
      last_four: (input.lastFour ?? "").trim() || null,
      notes: (input.notes ?? "").trim() || null,
    })
    .select("id, name, type, last_four, notes, created_at, updated_at")
    .single();
  if (error) {
    return { error: error.message ?? "Failed to create account." };
  }
  return {
    data: {
      id: row.id,
      name: row.name ?? "",
    },
  };
}

export async function getAccountsAction(): Promise<{ accounts: Array<{ id: string; name: string; type: string; lastFour: string | null; notes: string | null }>; error?: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { accounts: [], error: "Supabase is not configured." };
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { accounts: [], error: "You must be signed in." };

  const { data: rows, error } = await supabase
    .from("accounts")
    .select("id, name, type, last_four, notes, created_at, updated_at")
    .eq("user_id", user.id)
    .order("name");
  if (error) return { accounts: [], error: error.message ?? "Failed to load accounts." };
  return {
    accounts: (rows ?? []).map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? "",
      type: (r.type as string) ?? "Other",
      lastFour: (r.last_four as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    })),
  };
}
