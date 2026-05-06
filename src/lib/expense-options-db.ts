/**
 * expense_options: unified dropdown config for expenses (Supabase).
 */

import { getSupabaseClient } from "@/lib/supabase";

export type ExpenseOptionType =
  | "payment_method"
  | "payment_account"
  | "payment_source"
  | "category";

export type ExpenseOptionRow = {
  id: string;
  type: ExpenseOptionType;
  key: string;
  name: string;
  active: boolean;
  is_default: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ExpenseOptionPickerItem = {
  value: string;
  label: string;
  archived?: boolean;
};

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

const DEFAULT_PAYMENT_METHODS = ["ACH", "Card", "Cash", "Check", "Wire", "Zelle"];

const DEFAULT_PAYMENT_SOURCE_ROWS: ExpenseOptionRow[] = [
  {
    id: "fallback-company",
    type: "payment_source",
    key: "company",
    name: "Manual",
    active: true,
    is_default: true,
    is_system: true,
    sort_order: 1,
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-receipt-upload",
    type: "payment_source",
    key: "receipt_upload",
    name: "Receipt upload",
    active: true,
    is_default: false,
    is_system: true,
    sort_order: 2,
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-reimbursement",
    type: "payment_source",
    key: "reimbursement",
    name: "Worker reimbursement",
    active: true,
    is_default: false,
    is_system: true,
    sort_order: 3,
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-bank-import",
    type: "payment_source",
    key: "bank_import",
    name: "Bank import",
    active: true,
    is_default: false,
    is_system: true,
    sort_order: 4,
    created_at: "",
    updated_at: "",
  },
];

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

function slugKey(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base || "option";
}

function uniqueByLowerName(rows: ExpenseOptionPickerItem[]): ExpenseOptionPickerItem[] {
  const out: ExpenseOptionPickerItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function legacyRowsByStoredNameType(
  type: "payment_method" | "category"
): Promise<Array<{ name: string; active: boolean }>> {
  const c = client();
  if (type === "category") {
    const base = c.from("categories").select("name,status").eq("type", "expense").order("name");
    const { data, error } = await base;
    if (!error) {
      return ((data ?? []) as { name?: string | null; status?: string | null }[])
        .map((r) => ({ name: (r.name ?? "").trim(), active: (r.status ?? "active") === "active" }))
        .filter((r) => r.name !== "");
    }
    if (!isMissingTable(error) && !isMissingColumn(error)) {
      throw new Error(error.message ?? "Failed to load categories.");
    }
    if (isMissingColumn(error)) {
      const retry = await c.from("categories").select("name").eq("type", "expense").order("name");
      if (!retry.error) {
        return ((retry.data ?? []) as { name?: string | null }[])
          .map((r) => ({ name: (r.name ?? "").trim(), active: true }))
          .filter((r) => r.name !== "");
      }
    }
    return DEFAULT_CATEGORIES.map((name) => ({ name, active: true }));
  }

  const { data, error } = await c.from("payment_methods").select("name,status").order("name");
  if (!error) {
    return ((data ?? []) as { name?: string | null; status?: string | null }[])
      .map((r) => ({ name: (r.name ?? "").trim(), active: (r.status ?? "active") === "active" }))
      .filter((r) => r.name !== "");
  }
  if (!isMissingTable(error) && !isMissingColumn(error)) {
    throw new Error(error.message ?? "Failed to load payment methods.");
  }
  if (isMissingColumn(error)) {
    const retry = await c.from("payment_methods").select("name").order("name");
    if (!retry.error) {
      return ((retry.data ?? []) as { name?: string | null }[])
        .map((r) => ({ name: (r.name ?? "").trim(), active: true }))
        .filter((r) => r.name !== "");
    }
  }
  return DEFAULT_PAYMENT_METHODS.map((name) => ({ name, active: true }));
}

async function legacyPickerItemsByStoredName(
  type: "payment_method" | "category",
  storedName: string | null | undefined
): Promise<ExpenseOptionPickerItem[]> {
  const rows = await legacyRowsByStoredNameType(type);
  const cur = (storedName ?? "").trim();
  const activeItems = rows
    .filter((r) => r.active)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ value: r.name, label: r.name }));
  const items = uniqueByLowerName(activeItems);
  if (!cur) return items;

  const hit = rows.find((r) => r.name.toLowerCase() === cur.toLowerCase());
  const activeHit = items.some((i) => i.value.toLowerCase() === cur.toLowerCase());
  if (hit && !hit.active && !activeHit) {
    items.push({ value: hit.name, label: `${hit.name} (Archived)`, archived: true });
  } else if (!hit && !activeHit) {
    items.push({ value: cur, label: `${cur} (Archived)`, archived: true });
  }
  return items;
}

export async function expenseOptionsTableAvailable(): Promise<boolean> {
  const c = client();
  const { error } = await c.from("expense_options").select("id").limit(1);
  if (error && isMissingTable(error)) return false;
  return !error;
}

export async function listExpenseOptionsByType(
  type: ExpenseOptionType
): Promise<ExpenseOptionRow[]> {
  const c = client();
  const { data, error } = await c
    .from("expense_options")
    .select("*")
    .eq("type", type)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load expense options.");
  }
  return (data ?? []) as ExpenseOptionRow[];
}

/** Settings UI: unlike listExpenseOptionsByType, reports when the table is missing vs truly empty. */
export async function loadExpenseOptionsAdmin(type: ExpenseOptionType): Promise<{
  rows: ExpenseOptionRow[];
  tableMissing: boolean;
  error: string | null;
}> {
  const c = client();
  const { data, error } = await c
    .from("expense_options")
    .select("*")
    .eq("type", type)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { rows: [], tableMissing: true, error: null };
    return {
      rows: [],
      tableMissing: false,
      error: error.message ?? "Failed to load expense options.",
    };
  }
  return { rows: (data ?? []) as ExpenseOptionRow[], tableMissing: false, error: null };
}

/** Map expense_options rows to CreatableSelect-style option lists (inactive → disabled). */
export function expenseOptionRowsToCreatableSelectState(rows: ExpenseOptionRow[]): {
  options: string[];
  disabled: Set<string>;
} {
  const disabled = new Set<string>();
  const names = rows
    .map((r) => {
      if (!r.active) disabled.add(r.name);
      return r.name;
    })
    .filter(Boolean);
  return {
    options: Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)),
    disabled,
  };
}

export async function insertExpenseOption(input: {
  type: ExpenseOptionType;
  key?: string;
  name: string;
  active?: boolean;
  is_default?: boolean;
  is_system?: boolean;
  sort_order?: number;
}): Promise<ExpenseOptionRow | null> {
  const trimmed = input.name.trim();
  if (!trimmed) return null;
  const c = client();
  const { data: sameName, error: sameNameErr } = await c
    .from("expense_options")
    .select("*")
    .eq("type", input.type)
    .ilike("name", trimmed)
    .maybeSingle();
  if (sameNameErr && isMissingTable(sameNameErr)) return null;
  if (sameName) {
    const row = sameName as ExpenseOptionRow;
    if (input.active !== false && !row.active) await setExpenseOptionActive(row.id, true);
    if (input.is_default) await setDefaultExpenseOption(row.id, input.type);
    return row;
  }
  const key = input.key?.trim() || slugKey(trimmed);
  const sort_order =
    input.sort_order ??
    (await (async () => {
      const rows = await listExpenseOptionsByType(input.type);
      const max = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
      return max + 10;
    })());

  let useKey = key;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await c
      .from("expense_options")
      .insert({
        type: input.type,
        key: useKey,
        name: trimmed,
        active: input.active !== false,
        is_default: false,
        is_system: input.is_system ?? false,
        sort_order,
      })
      .select("*")
      .single();

    if (!error && data) {
      const row = data as ExpenseOptionRow;
      if (input.is_default) await setDefaultExpenseOption(row.id, input.type);
      return row;
    }

    if (error && /duplicate|unique|violates unique/i.test(error.message ?? "")) {
      const { data: dup } = await c
        .from("expense_options")
        .select("*")
        .eq("type", input.type)
        .ilike("name", trimmed)
        .maybeSingle();
      if (dup) {
        const row = dup as ExpenseOptionRow;
        if (input.is_default) await setDefaultExpenseOption(row.id, input.type);
        return row;
      }
      useKey = `${slugKey(trimmed)}_${crypto.randomUUID().slice(0, 8)}`;
      continue;
    }

    if (error && isMissingTable(error)) return null;
    console.warn("[insertExpenseOption]", error?.message);
    return null;
  }
  return null;
}

export async function updateExpenseOptionName(id: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const c = client();
  const { data: row, error: loadErr } = await c
    .from("expense_options")
    .select("id,type")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return false;
  const type = (row as { type: ExpenseOptionType }).type;
  const { data: duplicate, error: duplicateErr } = await c
    .from("expense_options")
    .select("id")
    .eq("type", type)
    .neq("id", id)
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (duplicateErr) return false;
  if (duplicate) return false;
  const { error } = await c.from("expense_options").update({ name: trimmed }).eq("id", id);
  return !error;
}

export async function setExpenseOptionActive(
  id: string,
  active: boolean
): Promise<{ ok: boolean; reason?: string }> {
  const c = client();
  const { data: row, error: loadErr } = await c
    .from("expense_options")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return { ok: false, reason: "Not found." };
  const r = row as ExpenseOptionRow;
  if (!active && r.type === "payment_source" && r.is_system) {
    return { ok: false, reason: "System payment sources cannot be archived." };
  }
  if (!active && r.is_default) {
    const rows = await listExpenseOptionsByType(r.type);
    const nextDefault = rows.find((candidate) => candidate.id !== id && candidate.active);
    if (!nextDefault) {
      return {
        ok: false,
        reason: "Choose another active default before archiving this option.",
      };
    }
    const moved = await setDefaultExpenseOption(nextDefault.id, r.type);
    if (!moved) return { ok: false, reason: "Could not move the default option." };
  }
  const { error } = await c.from("expense_options").update({ active }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function setDefaultExpenseOption(
  id: string,
  type: ExpenseOptionType
): Promise<boolean> {
  const c = client();
  const { data: row, error: loadErr } = await c
    .from("expense_options")
    .select("id,active")
    .eq("id", id)
    .eq("type", type)
    .maybeSingle();
  if (loadErr || !row || !(row as { active?: boolean }).active) return false;
  await c.from("expense_options").update({ is_default: false }).eq("type", type);
  const { error } = await c
    .from("expense_options")
    .update({ is_default: true })
    .eq("id", id)
    .eq("type", type);
  return !error;
}

/** Active payment_account option keys = payment_accounts.id */
export async function activePaymentAccountIds(): Promise<Set<string>> {
  const rows = await listExpenseOptionsByType("payment_account");
  const set = new Set<string>();
  for (const r of rows) {
    if (r.active) set.add(r.key);
  }
  return set;
}

/** False when account id is archived in expense_options (all active when table unused). */
export async function isPaymentAccountOptionActive(accountId: string): Promise<boolean> {
  if (!(await expenseOptionsTableAvailable())) return true;
  const rows = await listExpenseOptionsByType("payment_account");
  if (rows.length === 0) return true;
  const active = await activePaymentAccountIds();
  return active.has(accountId.trim());
}

export async function ensurePaymentAccountOptionRow(
  accountId: string,
  name: string
): Promise<void> {
  if (!(await expenseOptionsTableAvailable())) return;
  const c = client();
  const trimmed = name.trim();
  if (!trimmed) return;
  const { data: existing } = await c
    .from("expense_options")
    .select("id")
    .eq("type", "payment_account")
    .eq("key", accountId)
    .maybeSingle();
  if (existing) return;
  const rows = await listExpenseOptionsByType("payment_account");
  const sort_order = rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;
  await c.from("expense_options").insert({
    type: "payment_account",
    key: accountId,
    name: trimmed,
    active: true,
    is_default: false,
    is_system: false,
    sort_order,
  });
}

export async function syncPaymentAccountOptionName(accountId: string, name: string): Promise<void> {
  const c = client();
  const trimmed = name.trim();
  if (!trimmed) return;
  await c
    .from("expense_options")
    .update({ name: trimmed })
    .eq("type", "payment_account")
    .eq("key", accountId);
}

/** Merge picker items for types stored by display name (payment_method, category). */
export async function pickerItemsByStoredName(
  type: "payment_method" | "category",
  storedName: string | null | undefined
): Promise<ExpenseOptionPickerItem[]> {
  if (!(await expenseOptionsTableAvailable())) {
    return legacyPickerItemsByStoredName(type, storedName);
  }
  const rows = await listExpenseOptionsByType(type);
  if (rows.length === 0) return legacyPickerItemsByStoredName(type, storedName);
  const cur = (storedName ?? "").trim();
  const byName = new Map<string, ExpenseOptionRow>();
  for (const r of rows) {
    byName.set(r.name.toLowerCase(), r);
  }
  const activeRows = rows
    .filter((r) => r.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const items: ExpenseOptionPickerItem[] = uniqueByLowerName(
    activeRows.map((r) => ({
      value: r.name,
      label: r.name,
    }))
  );
  if (!cur) return items;

  const hit = byName.get(cur.toLowerCase());
  const activeHit = items.some((i) => i.value.toLowerCase() === cur.toLowerCase());
  if (hit && !hit.active && !activeHit) {
    items.push({ value: hit.name, label: `${hit.name} (Archived)`, archived: true });
    return items;
  }
  if (!hit && !activeHit) {
    items.push({ value: cur, label: `${cur} (Archived)`, archived: true });
  }
  return items;
}

/** Payment source: value is DB source_type key. */
export async function pickerItemsPaymentSource(
  storedKey: string | null | undefined
): Promise<ExpenseOptionPickerItem[]> {
  const available = await expenseOptionsTableAvailable();
  const rows = available
    ? await listExpenseOptionsByType("payment_source")
    : DEFAULT_PAYMENT_SOURCE_ROWS;
  const safeRows = rows.length > 0 ? rows : DEFAULT_PAYMENT_SOURCE_ROWS;
  const cur = (storedKey ?? "company")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const byKey = new Map(safeRows.map((r) => [r.key, r]));
  const activeRows = safeRows.filter((r) => r.active).sort((a, b) => a.sort_order - b.sort_order);
  const items: ExpenseOptionPickerItem[] = activeRows.map((r) => ({
    value: r.key,
    label: r.name,
  }));
  const hit = byKey.get(cur);
  if (hit && !hit.active) {
    items.push({ value: hit.key, label: `${hit.name} (Archived)`, archived: true });
    return items;
  }
  if (!hit && cur) {
    items.push({ value: cur, label: `${cur} (Archived)`, archived: true });
  }
  return items;
}

export async function defaultPaymentMethodName(): Promise<string | null> {
  if (!(await expenseOptionsTableAvailable())) {
    const legacy = await legacyRowsByStoredNameType("payment_method");
    return legacy.find((r) => r.active)?.name ?? DEFAULT_PAYMENT_METHODS[0] ?? null;
  }
  const rows = await listExpenseOptionsByType("payment_method");
  if (rows.length === 0) {
    const legacy = await legacyRowsByStoredNameType("payment_method");
    return legacy.find((r) => r.active)?.name ?? DEFAULT_PAYMENT_METHODS[0] ?? null;
  }
  const def = rows.find((r) => r.is_default && r.active);
  if (def) return def.name;
  const first = rows.find((r) => r.active);
  return first?.name ?? null;
}

export async function defaultPaymentSourceKey(): Promise<string> {
  const available = await expenseOptionsTableAvailable();
  const rows = available
    ? await listExpenseOptionsByType("payment_source")
    : DEFAULT_PAYMENT_SOURCE_ROWS;
  const safeRows = rows.length > 0 ? rows : DEFAULT_PAYMENT_SOURCE_ROWS;
  const def = safeRows.find((r) => r.is_default && r.active);
  if (def) return def.key;
  return "company";
}

export async function renameExpenseOptionById(
  id: string,
  newName: string,
  type: ExpenseOptionType,
  oldName: string
): Promise<boolean> {
  const ok = await updateExpenseOptionName(id, newName);
  if (!ok) return false;
  const c = client();
  const oldTrim = oldName.trim();
  const newTrim = newName.trim();
  if (type === "category") {
    await c.from("expense_lines").update({ category: newTrim }).ilike("category", oldTrim);
  }
  if (type === "payment_method") {
    await c.from("expenses").update({ payment_method: newTrim }).ilike("payment_method", oldTrim);
  }
  return true;
}

/** After renaming payment_account option, sync payment_accounts.name and expenses display (embedded name comes from PA table). */
export async function renamePaymentAccountOptionDisplay(
  accountId: string,
  newName: string
): Promise<boolean> {
  const trimmed = newName.trim();
  if (!trimmed) return false;
  const c = client();
  const { data: duplicateOption, error: optionErr } = await c
    .from("expense_options")
    .select("id")
    .eq("type", "payment_account")
    .neq("key", accountId)
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (optionErr || duplicateOption) return false;
  const { data: duplicateAccount, error: accountErr } = await c
    .from("payment_accounts")
    .select("id")
    .neq("id", accountId)
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (accountErr || duplicateAccount) return false;
  await c.from("payment_accounts").update({ name: trimmed }).eq("id", accountId);
  await c
    .from("expense_options")
    .update({ name: trimmed })
    .eq("type", "payment_account")
    .eq("key", accountId);
  return true;
}
