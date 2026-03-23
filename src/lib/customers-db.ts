"use server";

import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { CUSTOMERS_DB_COLUMNS } from "@/lib/customers-columns";

export type Customer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  contact_person?: string | null;
  status?: "active" | "inactive" | string | null;
  created_at?: string | null;
  updated_at?: string | null;
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
    .select(CUSTOMERS_DB_COLUMNS)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message ?? "Failed to load customers.");
  return (data ?? []) as Customer[];
}

export async function getCustomerById(
  id: string
): Promise<(Customer & { projects_count: number }) | null> {
  const c = admin();
  const { data, error } = await c
    .from("customers")
    .select(CUSTOMERS_DB_COLUMNS)
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
  contact_person?: string | null;
  notes?: string | null;
  status?: "active" | "inactive" | null;
};

export async function createCustomer(draft: CustomerDraft): Promise<Customer> {
  const c = admin();
  const payload = {
    name: draft.name.trim(),
    email: draft.email?.trim() || null,
    phone: draft.phone?.trim() || null,
    address: draft.address?.trim() || null,
    contact_person: draft.contact_person?.trim() || null,
    notes: draft.notes?.trim() || null,
    ...(draft.status ? { status: draft.status } : {}),
  };
  const { data, error } = await c
    .from("customers")
    .insert(payload)
    .select(CUSTOMERS_DB_COLUMNS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to create customer.");
  return data as Customer;
}

export async function updateCustomer(id: string, patch: Partial<CustomerDraft>): Promise<Customer> {
  const c = admin();
  const payload: Record<string, string | null> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.email !== undefined) payload.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) payload.phone = patch.phone?.trim() || null;
  if (patch.address !== undefined) {
    payload.address = patch.address?.trim() || null;
  }
  if (patch.contact_person !== undefined) {
    payload.contact_person = patch.contact_person?.trim() || null;
  }
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined && patch.status != null) {
    payload.status = patch.status;
  }

  const { data, error } = await c
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select(CUSTOMERS_DB_COLUMNS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to update customer.");
  return data as Customer;
}

export async function deleteCustomer(
  id: string
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
