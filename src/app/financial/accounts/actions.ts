"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
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
  const auth = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!auth.ok) return { error: "Authentication required." };

  try {
    const supabase = auth.client;
    const name = (input.name ?? "").trim();
    if (!name) {
      return { error: "Account name is required." };
    }
    const { data: row, error } = await supabase
      .from("accounts")
      .insert({
        user_id: auth.context.user.id,
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

export async function getAccountsAction(): Promise<{
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    lastFour: string | null;
    notes: string | null;
  }>;
  error?: string;
}> {
  const auth = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!auth.ok) return { accounts: [], error: auth.error };

  try {
    const { data: rows, error } = await auth.client
      .from("accounts")
      .select("id, name, type, last_four, notes, created_at, updated_at")
      .or(`user_id.eq.${auth.context.user.id},user_id.is.null`)
      .order("name");
    if (error || !Array.isArray(rows))
      return { accounts: [], error: "Accounts are unavailable. Please retry." };
    return {
      accounts: rows.map((r) => ({
        id: r.id as string,
        name: (r.name as string) ?? "",
        type: (r.type as string) ?? "Other",
        lastFour: (r.last_four as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
      })),
    };
  } catch {
    return { accounts: [], error: "Accounts are unavailable. Please retry." };
  }
}

export async function updateAccountAction(
  input: UpdateAccountInput
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!auth.ok) return { ok: false, error: "Authentication required." };

  try {
    const supabase = auth.client;
    const id = (input.id ?? "").trim();
    if (!id) return { ok: false, error: "Account id is required." };
    const name = (input.name ?? "").trim();
    if (!name) return { ok: false, error: "Account name is required." };

    const { data, error } = await supabase
      .from("accounts")
      .update({
        name,
        type: input.type ?? "Other",
        last_four: (input.lastFour ?? "").trim() || null,
        notes: (input.notes ?? "").trim() || null,
      })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: error.message ?? "Failed to update account." };
    if (data?.length !== 1) return { ok: false, error: "Account unavailable or update denied." };
    revalidatePath("/financial/accounts");
    return { ok: true };
  } catch (e) {
    console.error("[updateAccountAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update account." };
  }
}

export async function deleteAccountAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!auth.ok) return { ok: false, error: "Authentication required." };

  try {
    const supabase = auth.client;
    const accountId = (id ?? "").trim();
    if (!accountId) return { ok: false, error: "Account id is required." };

    const { data, error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId)
      .select("id");
    if (error) return { ok: false, error: error.message ?? "Failed to delete account." };
    if (data?.length !== 1) return { ok: false, error: "Account unavailable or deletion denied." };
    revalidatePath("/financial/accounts");
    return { ok: true };
  } catch (e) {
    console.error("[deleteAccountAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete account." };
  }
}
