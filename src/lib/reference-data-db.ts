/**
 * Reference data: expense categories, vendors, payment methods — Supabase only.
 * Tables: categories (type='expense'), vendors, payment_methods.
 * Expense categories + payment methods prefer `expense_options` when migrated.
 */

import * as expenseOpts from "@/lib/expense-options-db";
import { getSupabaseClient } from "@/lib/supabase";

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|does not exist.*column|schema cache/i.test(m);
}

const DEFAULT_CATEGORIES = [
  "Materials",
  "Labor",
  "Equipment",
  "Permit",
  "Fuel",
  "Vehicle",
  "Meals",
  "Office",
  "Subcontractor",
  "Other",
];
const DEFAULT_VENDORS = [
  "Home Depot",
  "Materials Co.",
  "Steel Supply Inc.",
  "City Permit Office",
  "Equipment Rentals",
];
const DEFAULT_PAYMENT_METHODS = ["ACH", "Card", "Cash", "Check", "Wire", "Zelle"];

async function ensureExpenseCategoriesExist(): Promise<void> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    if (rows.length > 0) return;
    for (const name of DEFAULT_CATEGORIES) {
      await expenseOpts.insertExpenseOption({ type: "category", name });
    }
    return;
  }
  const c = client();
  const { data: existing, error } = await c
    .from("categories")
    .select("name")
    .eq("type", "expense")
    .limit(1);
  if (error && isMissingTable(error)) return;
  if (existing && existing.length > 0) return;
  for (const name of DEFAULT_CATEGORIES) {
    await c.from("categories").insert({ name, type: "expense", status: "active" });
  }
}

export async function getExpenseCategories(includeDisabled = false): Promise<string[]> {
  await ensureExpenseCategoriesExist();
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    const list = includeDisabled ? rows : rows.filter((r) => r.active);
    return list
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((r) => r.name);
  }
  const c = client();
  const { data: rows, error } = await c
    .from("categories")
    .select("name, status")
    .eq("type", "expense")
    .order("name");
  if (error) {
    if (isMissingTable(error)) return [...DEFAULT_CATEGORIES];
    throw new Error(error.message ?? "Failed to load categories.");
  }
  const list = (rows ?? []) as { name: string; status: string }[];
  if (includeDisabled) return list.map((r) => r.name);
  return list.filter((r) => r.status === "active").map((r) => r.name);
}

export async function addExpenseCategory(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    const hit = rows.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());
    if (hit) {
      if (!hit.active) {
        await expenseOpts.setExpenseOptionActive(hit.id, true);
      }
      return hit.name;
    }
    const row = await expenseOpts.insertExpenseOption({ type: "category", name: trimmed });
    return row?.name ?? "";
  }
  const c = client();
  const { data: existing } = await c
    .from("categories")
    .select("name")
    .eq("type", "expense")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return (existing as { name: string }).name;
  const { data: disabled } = await c
    .from("categories")
    .select("id")
    .eq("type", "expense")
    .ilike("name", trimmed)
    .eq("status", "inactive")
    .maybeSingle();
  if (disabled) {
    await c
      .from("categories")
      .update({ status: "active" })
      .eq("type", "expense")
      .ilike("name", trimmed);
    return trimmed;
  }
  const ins = await c
    .from("categories")
    .insert({ name: trimmed, type: "expense", status: "active" });
  if (!ins.error) return trimmed;
  const msg = ins.error.message ?? "";
  if (/duplicate|unique|violates unique/i.test(msg)) {
    const { data: row } = await c
      .from("categories")
      .select("name")
      .eq("type", "expense")
      .ilike("name", trimmed)
      .maybeSingle();
    if (row) return (row as { name: string }).name;
  }
  console.warn("[addExpenseCategory]", msg);
  return "";
}

export async function getCategoryUsageCount(name: string): Promise<number> {
  const c = client();
  const { count } = await c
    .from("expense_lines")
    .select("id", { count: "exact", head: true })
    .eq("category", name);
  return count ?? 0;
}

export async function renameExpenseCategory(oldName: string, newName: string): Promise<boolean> {
  const oldTrim = oldName.trim();
  const newTrim = newName.trim();
  if (!newTrim || oldTrim.toLowerCase() === newTrim.toLowerCase()) return false;
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    const hit = rows.find((r) => r.name.toLowerCase() === oldTrim.toLowerCase());
    if (!hit) return false;
    return expenseOpts.renameExpenseOptionById(hit.id, newTrim, "category", oldTrim);
  }
  const c = client();
  const { data: row } = await c
    .from("categories")
    .select("id")
    .eq("type", "expense")
    .ilike("name", oldTrim)
    .maybeSingle();
  if (!row) return false;
  await c
    .from("categories")
    .update({ name: newTrim })
    .eq("id", (row as { id: string }).id);
  await c.from("expense_lines").update({ category: newTrim }).eq("category", oldTrim);
  return true;
}

export async function disableExpenseCategory(name: string): Promise<boolean> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!hit) return false;
    return (await expenseOpts.setExpenseOptionActive(hit.id, false)).ok;
  }
  const c = client();
  const { error } = await c
    .from("categories")
    .update({ status: "inactive" })
    .eq("type", "expense")
    .ilike("name", name.trim());
  return !error;
}

export async function enableExpenseCategory(name: string): Promise<boolean> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!hit) return false;
    return (await expenseOpts.setExpenseOptionActive(hit.id, true)).ok;
  }
  const c = client();
  const { error } = await c
    .from("categories")
    .update({ status: "active" })
    .eq("type", "expense")
    .ilike("name", name.trim());
  return !error;
}

export async function deleteExpenseCategory(name: string): Promise<boolean> {
  if ((await getCategoryUsageCount(name.trim())) > 0) return false;
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!hit) return false;
    return (await expenseOpts.setExpenseOptionActive(hit.id, false)).ok;
  }
  const c = client();
  await c.from("categories").delete().eq("type", "expense").ilike("name", name.trim());
  return true;
}

export async function isExpenseCategoryDisabled(name: string): Promise<boolean> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("category");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    return hit ? !hit.active : false;
  }
  const c = client();
  const { data: row } = await c
    .from("categories")
    .select("status")
    .eq("type", "expense")
    .ilike("name", name.trim())
    .maybeSingle();
  return (row as { status: string } | null)?.status === "inactive";
}

async function ensureVendorsExist(): Promise<void> {
  const c = client();
  const { data: existing, error } = await c.from("vendors").select("id").limit(1);
  if (error && isMissingTable(error)) return;
  if (existing && existing.length > 0) return;
  for (const name of DEFAULT_VENDORS) {
    const ins = await c.from("vendors").insert({ name, status: "active" });
    if (ins.error && isMissingColumn(ins.error)) {
      await c.from("vendors").insert({ name });
    }
  }
}

export async function getVendors(includeDisabled = false): Promise<string[]> {
  const c = client();
  await ensureVendorsExist();
  let rows: unknown[] | null = null;
  let error: { message?: string } | null = null;
  const res = await c.from("vendors").select("name, status").order("name");
  error = res.error;
  rows = res.data;
  if (error && isMissingColumn(error)) {
    const fallback = await c.from("vendors").select("name").order("name");
    if (fallback.error && isMissingTable(fallback.error)) return [...DEFAULT_VENDORS];
    if (fallback.error) throw new Error(fallback.error.message ?? "Failed to load vendors.");
    rows = fallback.data;
  } else if (error) {
    if (isMissingTable(error)) return [...DEFAULT_VENDORS];
    throw new Error(error.message ?? "Failed to load vendors.");
  }
  const list = (rows ?? []) as { name: string; status?: string }[];
  if (includeDisabled) return list.map((r) => r.name);
  return list.filter((r) => (r.status ?? "active") === "active").map((r) => r.name);
}

export async function addVendor(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const c = client();
  const { data: existing } = await c
    .from("vendors")
    .select("name")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return (existing as { name: string }).name;
  const withStatus = await c
    .from("vendors")
    .select("id")
    .ilike("name", trimmed)
    .eq("status", "inactive")
    .maybeSingle();
  if (!withStatus.error && withStatus.data) {
    const upd = await c.from("vendors").update({ status: "active" }).ilike("name", trimmed);
    if (!upd.error) return trimmed;
  }
  const ins = await c.from("vendors").insert({ name: trimmed, status: "active" });
  if (ins.error && isMissingColumn(ins.error)) {
    await c.from("vendors").insert({ name: trimmed });
  }
  return trimmed;
}

export async function getVendorUsageCount(name: string): Promise<number> {
  const c = client();
  const { count } = await c
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .ilike("vendor_name", name);
  return count ?? 0;
}

export async function renameVendor(oldName: string, newName: string): Promise<boolean> {
  const c = client();
  const { data: row } = await c
    .from("vendors")
    .select("id")
    .ilike("name", oldName.trim())
    .maybeSingle();
  if (!row) return false;
  await c
    .from("vendors")
    .update({ name: newName.trim() })
    .eq("id", (row as { id: string }).id);
  await c
    .from("expenses")
    .update({ vendor_name: newName.trim() })
    .ilike("vendor_name", oldName.trim());
  return true;
}

export async function disableVendor(name: string): Promise<boolean> {
  const c = client();
  const { error } = await c
    .from("vendors")
    .update({ status: "inactive" })
    .ilike("name", name.trim());
  return !error;
}

export async function enableVendor(name: string): Promise<boolean> {
  const c = client();
  const { error } = await c.from("vendors").update({ status: "active" }).ilike("name", name.trim());
  return !error;
}

export async function deleteVendor(name: string): Promise<boolean> {
  if ((await getVendorUsageCount(name.trim())) > 0) return false;
  const c = client();
  await c.from("vendors").delete().ilike("name", name.trim());
  return true;
}

export async function isVendorDisabled(name: string): Promise<boolean> {
  const c = client();
  const { data: row } = await c
    .from("vendors")
    .select("status")
    .ilike("name", name.trim())
    .maybeSingle();
  return (row as { status: string } | null)?.status === "inactive";
}

async function ensurePaymentMethodsExist(): Promise<void> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    if (rows.length > 0) return;
    for (const name of DEFAULT_PAYMENT_METHODS) {
      await expenseOpts.insertExpenseOption({ type: "payment_method", name });
    }
    return;
  }
  const c = client();
  const { data: existing, error } = await c.from("payment_methods").select("id").limit(1);
  if (error && isMissingTable(error)) return;
  if (existing && existing.length > 0) return;
  for (const name of DEFAULT_PAYMENT_METHODS) {
    await c.from("payment_methods").insert({ name, status: "active" });
  }
}

export async function getPaymentMethods(includeDisabled = false): Promise<string[]> {
  await ensurePaymentMethodsExist();
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    const list = includeDisabled ? rows : rows.filter((r) => r.active);
    return list
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((r) => r.name);
  }
  const c = client();
  const { data: rows, error } = await c
    .from("payment_methods")
    .select("name, status")
    .order("name");
  if (error) {
    if (isMissingTable(error)) return [...DEFAULT_PAYMENT_METHODS];
    throw new Error(error.message ?? "Failed to load payment_methods.");
  }
  const list = (rows ?? []) as { name: string; status: string }[];
  if (includeDisabled) return list.map((r) => r.name);
  return list.filter((r) => r.status === "active").map((r) => r.name);
}

export async function addPaymentMethod(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    const hit = rows.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());
    if (hit) {
      if (!hit.active) await expenseOpts.setExpenseOptionActive(hit.id, true);
      return hit.name;
    }
    const row = await expenseOpts.insertExpenseOption({ type: "payment_method", name: trimmed });
    return row?.name ?? "";
  }
  const c = client();
  const { data: existing } = await c
    .from("payment_methods")
    .select("name")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return (existing as { name: string }).name;
  const { data: inactive } = await c
    .from("payment_methods")
    .select("id")
    .ilike("name", trimmed)
    .eq("status", "inactive")
    .maybeSingle();
  if (inactive) {
    await c.from("payment_methods").update({ status: "active" }).ilike("name", trimmed);
    return trimmed;
  }
  await c.from("payment_methods").insert({ name: trimmed, status: "active" });
  return trimmed;
}

export async function getPaymentMethodUsageCount(name: string): Promise<number> {
  const c = client();
  const { count, error } = await c
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .ilike("payment_method", name);
  if (error && isMissingColumn(error)) return 0;
  return count ?? 0;
}

export async function renamePaymentMethod(oldName: string, newName: string): Promise<boolean> {
  const oldTrim = oldName.trim();
  const newTrim = newName.trim();
  if (!newTrim || oldTrim.toLowerCase() === newTrim.toLowerCase()) return false;
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    const hit = rows.find((r) => r.name.toLowerCase() === oldTrim.toLowerCase());
    if (!hit) return false;
    return expenseOpts.renameExpenseOptionById(hit.id, newTrim, "payment_method", oldTrim);
  }
  const c = client();
  const { data: row } = await c
    .from("payment_methods")
    .select("id")
    .ilike("name", oldTrim)
    .maybeSingle();
  if (!row) return false;
  await c
    .from("payment_methods")
    .update({ name: newTrim })
    .eq("id", (row as { id: string }).id);
  const { error } = await c
    .from("expenses")
    .update({ payment_method: newTrim })
    .ilike("payment_method", oldTrim);
  if (error && isMissingColumn(error)) return true;
  return true;
}

export async function disablePaymentMethod(name: string): Promise<boolean> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!hit) return false;
    return (await expenseOpts.setExpenseOptionActive(hit.id, false)).ok;
  }
  const c = client();
  const { error } = await c
    .from("payment_methods")
    .update({ status: "inactive" })
    .ilike("name", name.trim());
  return !error;
}

export async function enablePaymentMethod(name: string): Promise<boolean> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!hit) return false;
    return (await expenseOpts.setExpenseOptionActive(hit.id, true)).ok;
  }
  const c = client();
  const { error } = await c
    .from("payment_methods")
    .update({ status: "active" })
    .ilike("name", name.trim());
  return !error;
}

export async function deletePaymentMethod(name: string): Promise<boolean> {
  if ((await getPaymentMethodUsageCount(name.trim())) > 0) return false;
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!hit) return false;
    return (await expenseOpts.setExpenseOptionActive(hit.id, false)).ok;
  }
  const c = client();
  await c.from("payment_methods").delete().ilike("name", name.trim());
  return true;
}

export async function isPaymentMethodDisabled(name: string): Promise<boolean> {
  if (await expenseOpts.expenseOptionsTableAvailable()) {
    const rows = await expenseOpts.listExpenseOptionsByType("payment_method");
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    return hit ? !hit.active : false;
  }
  const c = client();
  const { data: row } = await c
    .from("payment_methods")
    .select("status")
    .ilike("name", name.trim())
    .maybeSingle();
  return (row as { status: string } | null)?.status === "inactive";
}
