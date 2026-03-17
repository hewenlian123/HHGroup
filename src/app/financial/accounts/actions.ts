"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, getServerSupabase } from "@/lib/supabase-server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import type { AccountType } from "@/lib/accounts-db";

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  lastFour?: string | null;
  notes?: string | null;
};

export type UpdateAccountInput = {
  id: string;
  name: string;
  type: AccountType;
  lastFour?: string | null;
  notes?: string | null;
};

export async function createAccountAction(
  input: CreateAccountInput
): Promise<{ data?: { id: string; name: string }; error?: string }> {
  try {
    const supabase = (await createServerSupabaseClient()) ?? getServerSupabase();
    if (!supabase) {
      return { error: "Supabase is not configured." };
    }
    // If the DB/RLS allows anon inserts, proceed without a user session.
    // When signed in, we attach user_id for ownership.
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null as any } }));
    const name = (input.name ?? "").trim();
    if (!name) {
      return { error: "Account name is required." };
    }
    const { data: row, error } = await supabase
      .from("accounts")
      .insert({
        user_id: user?.id ?? null,
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
    revalidatePath("/financial/accounts");
    return {
      data: {
        id: row.id,
        name: row.name ?? "",
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create account.";
    // Ensure we don't surface as 503 without details in dev.
    console.error("[createAccountAction]", e);
    return { error: message };
  }
}

export async function getAccountsAction(): Promise<{ accounts: Array<{ id: string; name: string; type: string; lastFour: string | null; notes: string | null }>; error?: string }> {
  const supabase = (await createServerSupabaseClient()) ?? getServerSupabase();
  if (!supabase) return { accounts: [], error: "Supabase is not configured." };
  // user is optional; when present we can optionally scope admin results.
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null as any } }));

  // Prefer admin client (if configured) to avoid "old rows with null/mismatched user_id" disappearing.
  // We still scope results to the signed-in user when possible (user_id=user OR user_id is null).
  const admin = getServerSupabaseAdmin();
  const client = admin ?? supabase;

  let q = client
    .from("accounts")
    .select("id, name, type, last_four, notes, created_at, updated_at")
    .order("name");
  if (admin && user?.id) {
    q = q.or(`user_id.eq.${user.id},user_id.is.null`);
  }
  const { data: rows, error } = await q;
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

export async function updateAccountAction(
  input: UpdateAccountInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = (await createServerSupabaseClient()) ?? getServerSupabase();
    if (!supabase) return { ok: false, error: "Supabase is not configured." };
    const id = (input.id ?? "").trim();
    if (!id) return { ok: false, error: "Account id is required." };
    const name = (input.name ?? "").trim();
    if (!name) return { ok: false, error: "Account name is required." };

    const { error } = await supabase
      .from("accounts")
      .update({
        name,
        type: input.type ?? "Other",
        last_four: (input.lastFour ?? "").trim() || null,
        notes: (input.notes ?? "").trim() || null,
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message ?? "Failed to update account." };
    revalidatePath("/financial/accounts");
    return { ok: true };
  } catch (e) {
    console.error("[updateAccountAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update account." };
  }
}

export async function deleteAccountAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = (await createServerSupabaseClient()) ?? getServerSupabase();
    if (!supabase) return { ok: false, error: "Supabase is not configured." };
    const accountId = (id ?? "").trim();
    if (!accountId) return { ok: false, error: "Account id is required." };

    const { error } = await supabase.from("accounts").delete().eq("id", accountId);
    if (error) return { ok: false, error: error.message ?? "Failed to delete account." };
    revalidatePath("/financial/accounts");
    return { ok: true };
  } catch (e) {
    console.error("[deleteAccountAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete account." };
  }
}
