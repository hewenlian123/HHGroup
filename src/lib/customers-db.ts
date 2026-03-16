"use server";

import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export type Customer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

function admin() {
  const c = getServerSupabaseAdmin();
  if (!c) throw new Error("Supabase admin client is not configured.");
  return c;
}

export async function getAllCustomers(): Promise<Customer[]> {
  const c = admin();
  const { data, error } = await c
    .from("customers")
    .select(
      "id,name,email,phone,address,city,state,zip,notes,created_at",
    )
    .order("name", { ascending: true });
  if (error) throw new Error(error.message ?? "Failed to load customers.");
  return (data ?? []) as Customer[];
}

export async function getCustomerById(
  id: string,
): Promise<(Customer & { projects_count: number }) | null> {
  const c = admin();
  const { data, error } = await c
    .from("customers")
    .select(
      "id,name,email,phone,address,city,state,zip,notes,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load customer.");
  if (!data) return null;
  const { count } = await c
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);
  return { ...(data as Customer), projects_count: count ?? 0 };
}

export type CustomerDraft = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
};

export async function createCustomer(
  draft: CustomerDraft,
): Promise<Customer> {
  const c = admin();
  const payload = {
    name: draft.name.trim(),
    email: draft.email?.trim() || null,
    phone: draft.phone?.trim() || null,
    address: draft.address?.trim() || null,
    city: draft.city?.trim() || null,
    state: draft.state?.trim() || null,
    zip: draft.zip?.trim() || null,
    notes: draft.notes?.trim() || null,
  };
  const { data, error } = await c
    .from("customers")
    .insert(payload)
    .select(
      "id,name,email,phone,address,city,state,zip,notes,created_at",
    )
    .single();
  if (error) throw new Error(error.message ?? "Failed to create customer.");
  return data as Customer;
}

export async function updateCustomer(
  id: string,
  patch: Partial<CustomerDraft>,
): Promise<Customer> {
  const c = admin();
  const payload: Record<string, string | null> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.email !== undefined) payload.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) payload.phone = patch.phone?.trim() || null;
  if (patch.address !== undefined) {
    payload.address = patch.address?.trim() || null;
  }
  if (patch.city !== undefined) payload.city = patch.city?.trim() || null;
  if (patch.state !== undefined) payload.state = patch.state?.trim() || null;
  if (patch.zip !== undefined) payload.zip = patch.zip?.trim() || null;
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;

  const { data, error } = await c
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select(
      "id,name,email,phone,address,city,state,zip,notes,created_at",
    )
    .single();
  if (error) throw new Error(error.message ?? "Failed to update customer.");
  return data as Customer;
}

export async function deleteCustomer(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const c = admin();
  const { count } = await c
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      reason: "This customer has linked projects and cannot be deleted.",
    };
  }
  const { error } = await c.from("customers").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      reason: error.message ?? "Failed to delete customer.",
    };
  }
  return { ok: true };
}

