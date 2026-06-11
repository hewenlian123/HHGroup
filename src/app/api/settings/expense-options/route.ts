import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const VALID_TYPES = new Set(["payment_method", "payment_account", "payment_source", "category"]);

type ExpenseOptionRow = {
  id: string;
  type: string;
  key: string;
  name: string;
  active: boolean;
  is_default: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function isMissingTable(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(message);
}

function isMissingColumn(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /column .* does not exist|does not exist.*column|schema cache/i.test(message);
}

function sanitizeType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const type = value.trim();
  return VALID_TYPES.has(type) ? type : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function slugKey(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || crypto.randomUUID().slice(0, 12);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const url = new URL(request.url);
  const type = sanitizeType(url.searchParams.get("type"));
  if (!type) return apiError(400, "Expense option type is required.");

  const { data, error } = await supabase
    .from("expense_options")
    .select("*")
    .eq("type", type)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { ok: true, rows: [], tableMissing: true },
        { headers: NO_CACHE_HEADERS }
      );
    }
    console.error("[settings/expense-options] load failed", error);
    return apiError(500, "Failed to load expense options.");
  }

  return NextResponse.json(
    { ok: true, rows: (data ?? []) as ExpenseOptionRow[], tableMissing: false },
    { headers: NO_CACHE_HEADERS }
  );
}

export async function POST(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid expense option payload.");

  const type = sanitizeType(body.type);
  const name = stringOrNull(body.name);
  if (!type || !name) return apiError(400, "Expense option type and name are required.");
  if (type === "payment_source") return apiError(400, "Payment sources are system managed.");

  try {
    const { data: existing, error: existingError } = await supabase
      .from("expense_options")
      .select("*")
      .eq("type", type)
      .ilike("name", name)
      .maybeSingle();
    if (existingError && isMissingTable(existingError)) {
      return apiError(400, "Expense options are not available.");
    }
    if (existingError) throw existingError;

    if (existing) {
      const row = existing as ExpenseOptionRow;
      if (!row.active) {
        const { data: activated, error: activateError } = await supabase
          .from("expense_options")
          .update({ active: true })
          .eq("id", row.id)
          .select("*")
          .maybeSingle();
        if (activateError) throw activateError;
        if (!activated) return apiError(404, "Expense option not found.");
        return NextResponse.json({ ok: true, row: activated }, { headers: NO_CACHE_HEADERS });
      }
      return NextResponse.json({ ok: true, row }, { headers: NO_CACHE_HEADERS });
    }

    const { data: rows } = await supabase
      .from("expense_options")
      .select("sort_order")
      .eq("type", type);
    const maxSort = Array.isArray(rows)
      ? rows.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0)
      : 0;

    let key = slugKey(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from("expense_options")
        .insert({
          type,
          key,
          name,
          active: true,
          is_default: false,
          is_system: false,
          sort_order: maxSort + 10,
        })
        .select("*")
        .single();

      if (!error && data) {
        return NextResponse.json({ ok: true, row: data }, { headers: NO_CACHE_HEADERS });
      }
      if (error && /duplicate|unique|violates unique/i.test(error.message ?? "")) {
        key = `${slugKey(name)}_${crypto.randomUUID().slice(0, 8)}`;
        continue;
      }
      throw error;
    }

    return apiError(409, "Could not create expense option.");
  } catch (error) {
    console.error("[settings/expense-options] create failed", error);
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Failed to save expense option.";
    return apiError(500, message);
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid expense option payload.");

  const action = stringOrNull(body.action);
  const id = stringOrNull(body.id);
  const type = sanitizeType(body.type);
  if (!action || !id || !type) {
    return apiError(400, "Unsupported expense option action.");
  }

  try {
    if (action === "rename") {
      const name = stringOrNull(body.name);
      if (!name) return apiError(400, "Expense option name is required.");

      const { data: row, error: loadError } = await supabase
        .from("expense_options")
        .select("*")
        .eq("id", id)
        .eq("type", type)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!row) return apiError(404, "Expense option not found.");

      const current = row as ExpenseOptionRow;
      if (current.name.trim().toLowerCase() !== name.toLowerCase()) {
        const { data: duplicate, error: duplicateError } = await supabase
          .from("expense_options")
          .select("id")
          .eq("type", type)
          .neq("id", id)
          .ilike("name", name)
          .limit(1)
          .maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) return apiError(409, "An expense option with this name already exists.");

        if (type === "payment_account") {
          const { data: duplicateAccount, error: accountDuplicateError } = await supabase
            .from("payment_accounts")
            .select("id")
            .neq("id", current.key)
            .ilike("name", name)
            .limit(1)
            .maybeSingle();
          if (
            accountDuplicateError &&
            !isMissingTable(accountDuplicateError) &&
            !isMissingColumn(accountDuplicateError)
          ) {
            throw accountDuplicateError;
          }
          if (duplicateAccount)
            return apiError(409, "A payment account with this name already exists.");

          const { error: accountUpdateError } = await supabase
            .from("payment_accounts")
            .update({ name })
            .eq("id", current.key);
          if (
            accountUpdateError &&
            !isMissingTable(accountUpdateError) &&
            !isMissingColumn(accountUpdateError)
          ) {
            throw accountUpdateError;
          }
        }

        const { data: updated, error: updateError } = await supabase
          .from("expense_options")
          .update({ name })
          .eq("id", id)
          .eq("type", type)
          .select("*")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updated) return apiError(404, "Expense option not found.");

        if (type === "category") {
          const { error: lineUpdateError } = await supabase
            .from("expense_lines")
            .update({ category: name })
            .ilike("category", current.name);
          if (
            lineUpdateError &&
            !isMissingTable(lineUpdateError) &&
            !isMissingColumn(lineUpdateError)
          ) {
            throw lineUpdateError;
          }
        }
        if (type === "payment_method") {
          const { error: expenseUpdateError } = await supabase
            .from("expenses")
            .update({ payment_method: name })
            .ilike("payment_method", current.name);
          if (
            expenseUpdateError &&
            !isMissingTable(expenseUpdateError) &&
            !isMissingColumn(expenseUpdateError)
          ) {
            throw expenseUpdateError;
          }
        }

        return NextResponse.json({ ok: true, row: updated }, { headers: NO_CACHE_HEADERS });
      }

      return NextResponse.json({ ok: true, row: current }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "set-active") {
      const active = booleanOrNull(body.active);
      if (active == null) return apiError(400, "Active state is required.");

      const { data: row, error: loadError } = await supabase
        .from("expense_options")
        .select("*")
        .eq("id", id)
        .eq("type", type)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!row) return apiError(404, "Expense option not found.");
      const current = row as ExpenseOptionRow;
      if (!active && current.type === "payment_source" && current.is_system) {
        return apiError(400, "System payment sources cannot be archived.");
      }

      if (!active && current.is_default) {
        const { data: nextDefault, error: nextError } = await supabase
          .from("expense_options")
          .select("*")
          .eq("type", type)
          .eq("active", true)
          .neq("id", id)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (nextError) throw nextError;
        if (!nextDefault) {
          return apiError(400, "Choose another active default before archiving this option.");
        }

        const { error: clearError } = await supabase
          .from("expense_options")
          .update({ is_default: false })
          .eq("type", type);
        if (clearError) throw clearError;

        const { error: setNextError } = await supabase
          .from("expense_options")
          .update({ is_default: true })
          .eq("id", (nextDefault as ExpenseOptionRow).id)
          .eq("type", type);
        if (setNextError) throw setNextError;
      }

      const { data: updated, error: updateError } = await supabase
        .from("expense_options")
        .update({ active, ...(active ? {} : { is_default: false }) })
        .eq("id", id)
        .eq("type", type)
        .select("*")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return apiError(404, "Expense option not found.");

      return NextResponse.json({ ok: true, row: updated }, { headers: NO_CACHE_HEADERS });
    }

    if (action !== "set-default") {
      return apiError(400, "Unsupported expense option action.");
    }

    const { data: row, error: loadError } = await supabase
      .from("expense_options")
      .select("id,type,active")
      .eq("id", id)
      .eq("type", type)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) return apiError(404, "Expense option not found.");
    if (!row.active) return apiError(400, "Archived options cannot be default.");

    const { error: clearError } = await supabase
      .from("expense_options")
      .update({ is_default: false })
      .eq("type", type);
    if (clearError) throw clearError;

    const { data: updated, error: setError } = await supabase
      .from("expense_options")
      .update({ is_default: true })
      .eq("id", id)
      .eq("type", type)
      .select("*")
      .maybeSingle();
    if (setError) throw setError;
    if (!updated) return apiError(404, "Expense option not found.");

    return NextResponse.json({ ok: true, row: updated }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[settings/expense-options] update failed", error);
    return apiError(500, "Failed to update expense option.");
  }
}
