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
