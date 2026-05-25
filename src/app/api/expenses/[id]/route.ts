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
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

const EXPENSE_LINE_SELECT = "id, expense_id, project_id, category, cost_code, memo, amount";

type ExpenseLinePatch = {
  projectId?: unknown;
  category?: unknown;
  costCode?: unknown;
  memo?: unknown;
  amount?: unknown;
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function linePatchToDb(patch: ExpenseLinePatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "projectId")) {
    payload.project_id = stringOrNull(patch.projectId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "category")) {
    payload.category = nullableString(patch.category) ?? "Other";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "costCode")) {
    payload.cost_code = nullableString(patch.costCode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "memo")) {
    payload.memo = nullableString(patch.memo);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "amount")) {
    const amount = Number(patch.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Line amount must be a valid number.");
    }
    payload.amount = amount;
  }
  return payload;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const [expRes, linesRes, projectRes, vendorsRes, categoriesRes, pmRes, attachmentsRes] =
    await Promise.all([
      supabase.from("expenses").select("*").eq("id", id).maybeSingle(),
      supabase.from("expense_lines").select("*").eq("expense_id", id),
      supabase
        .from("projects")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("vendors")
        .select("id,name,status")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("categories")
        .select("id,name,status")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("payment_methods")
        .select("id,name,status")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("attachments")
        .select("*")
        .eq("entity_type", "expense")
        .eq("entity_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (expRes.error) {
    console.error("[expenses/:id] load failed", expRes.error);
    return apiError(500, "Failed to load expense.");
  }
  if (!expRes.data) return apiError(404, "Expense not found.");
  if (linesRes.error) {
    console.error("[expenses/:id] lines load failed", linesRes.error);
    return apiError(500, "Failed to load expense lines.");
  }

  return NextResponse.json(
    {
      ok: true,
      expense: expRes.data,
      lines: linesRes.data ?? [],
      projects: projectRes.error ? [] : (projectRes.data ?? []),
      vendors: vendorsRes.error ? [] : (vendorsRes.data ?? []),
      categories: categoriesRes.error ? [] : (categoriesRes.data ?? []),
      paymentMethods: pmRes.error ? [] : (pmRes.data ?? []),
      attachments: attachmentsRes.error ? [] : (attachmentsRes.data ?? []),
    },
    { headers: NO_CACHE_HEADERS }
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid expense payload.");

  const patch: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "expense_date")) {
    patch.expense_date = stringOrNull(body.expense_date);
  }
  if (Object.prototype.hasOwnProperty.call(body, "vendor_name")) {
    patch.vendor_name = stringOrNull(body.vendor_name);
  }
  if (Object.prototype.hasOwnProperty.call(body, "payment_method")) {
    patch.payment_method = stringOrNull(body.payment_method);
  }
  if (Object.prototype.hasOwnProperty.call(body, "reference_no")) {
    patch.reference_no = stringOrNull(body.reference_no);
  }
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = stringOrNull(body.notes);
  }
  if (Object.keys(patch).length === 0) return apiError(400, "No expense fields to update.");

  const { data, error } = await supabase
    .from("expenses")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[expenses/:id] update failed", error);
    return apiError(500, "Failed to save expense.");
  }
  if (!data) return apiError(404, "Expense not found.");
  return NextResponse.json({ ok: true, expense: data }, { headers: NO_CACHE_HEADERS });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const body = await readJson(request);
  if (!body) return apiError(400, "Invalid expense action payload.");
  const action = stringOrNull(body.action);

  try {
    if (action === "add-line") {
      const { data, error } = await supabase
        .from("expense_lines")
        .insert([{ expense_id: id, project_id: null, category: "Other", amount: 0 }])
        .select(EXPENSE_LINE_SELECT)
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, line: data }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "update-line") {
      const lineId = stringOrNull(body.lineId);
      if (!lineId) return apiError(400, "Expense line is required.");
      const patch = linePatchToDb((body.patch ?? {}) as ExpenseLinePatch);
      if (Object.keys(patch).length === 0) return apiError(400, "No line fields to update.");
      const { data, error } = await supabase
        .from("expense_lines")
        .update(patch)
        .eq("id", lineId)
        .eq("expense_id", id)
        .select(EXPENSE_LINE_SELECT)
        .maybeSingle();
      if (error) throw error;
      if (!data) return apiError(404, "Expense line not found.");
      return NextResponse.json({ ok: true, line: data }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "delete-line") {
      const lineId = stringOrNull(body.lineId);
      if (!lineId) return apiError(400, "Expense line is required.");
      const { data, error } = await supabase
        .from("expense_lines")
        .delete()
        .eq("id", lineId)
        .eq("expense_id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) return apiError(404, "Expense line not found.");
      return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "add-vendor" || action === "add-category" || action === "add-payment-method") {
      const name = stringOrNull(body.name);
      if (!name) return apiError(400, "Name is required.");
      const table =
        action === "add-vendor"
          ? "vendors"
          : action === "add-category"
            ? "categories"
            : "payment_methods";
      const payload =
        action === "add-category"
          ? { name, type: "expense", status: "active" }
          : { name, status: "active" };
      const { error } = await supabase.from(table).insert([payload]);
      if (error) throw error;
      return NextResponse.json({ ok: true, name }, { headers: NO_CACHE_HEADERS });
    }
  } catch (error) {
    console.error("[expenses/:id] action failed", { action, error });
    return apiError(500, "Expense action failed.");
  }

  return apiError(400, "Unsupported expense action.");
}
