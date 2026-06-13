import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseAdmin,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import {
  expenseIsArchivedDoneDbStatus,
  expenseSourceTypeIsWorkerReimbursement,
} from "@/lib/expense-workflow-status";
import { syncExpenseHeaderAmountFromLinesWithClient } from "@/lib/expenses-db";

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
const EXPENSE_STATUS_VALUES = new Set([
  "pending",
  "needs_review",
  "reviewed",
  "approved",
  "reimbursed",
  "reimbursable",
  "paid",
  "draft",
]);
const EXPENSE_SOURCE_TYPES = new Set(["company", "reimbursement", "receipt_upload", "bank_import"]);

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

function optionalStatus(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const status = value.trim();
  return EXPENSE_STATUS_VALUES.has(status) ? status : undefined;
}

function optionalSourceType(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const sourceType = value.trim();
  return EXPENSE_SOURCE_TYPES.has(sourceType) ? sourceType : undefined;
}

function isMissingTable(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(message);
}

function slugKey(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || crypto.randomUUID().slice(0, 12);
}

function isSafeTestExpenseVendor(value: string | null | undefined): boolean {
  const vendor = String(value ?? "").trim();
  return (
    vendor.startsWith("ZZ-E2E-") ||
    vendor.startsWith("E2E-") ||
    vendor.startsWith("ZZ-PROD-WR-SMOKE-") ||
    vendor.startsWith("ZZ-PROD-DELETE-SMOKE-") ||
    /^SmokeVendor[-_]/i.test(vendor)
  );
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

  const [
    expRes,
    linesRes,
    projectRes,
    vendorsRes,
    categoriesRes,
    pmRes,
    optionCategoriesRes,
    optionPaymentMethodsRes,
    attachmentsRes,
  ] = await Promise.all([
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
      .from("expense_options")
      .select("id,name,active")
      .eq("type", "category")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500),
    supabase
      .from("expense_options")
      .select("id,name,active")
      .eq("type", "payment_method")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
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
      categories:
        !optionCategoriesRes.error && (optionCategoriesRes.data?.length ?? 0) > 0
          ? optionCategoriesRes.data.map((row) => ({
              id: row.id,
              name: row.name,
              status: row.active ? "active" : "inactive",
            }))
          : categoriesRes.error
            ? []
            : (categoriesRes.data ?? []),
      paymentMethods:
        !optionPaymentMethodsRes.error && (optionPaymentMethodsRes.data?.length ?? 0) > 0
          ? optionPaymentMethodsRes.data.map((row) => ({
              id: row.id,
              name: row.name,
              status: row.active ? "active" : "inactive",
            }))
          : pmRes.error
            ? []
            : (pmRes.data ?? []),
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
  if (Object.prototype.hasOwnProperty.call(body, "date")) {
    patch.expense_date = stringOrNull(body.date);
  }
  if (Object.prototype.hasOwnProperty.call(body, "vendor_name")) {
    patch.vendor_name = stringOrNull(body.vendor_name);
  }
  if (Object.prototype.hasOwnProperty.call(body, "vendorName")) {
    const vendorName = stringOrNull(body.vendorName);
    patch.vendor_name = vendorName;
    patch.vendor = vendorName;
  }
  if (Object.prototype.hasOwnProperty.call(body, "payment_method")) {
    patch.payment_method = stringOrNull(body.payment_method);
  }
  if (Object.prototype.hasOwnProperty.call(body, "paymentMethod")) {
    patch.payment_method = stringOrNull(body.paymentMethod);
  }
  if (Object.prototype.hasOwnProperty.call(body, "reference_no")) {
    patch.reference_no = stringOrNull(body.reference_no);
  }
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = stringOrNull(body.notes);
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = optionalStatus(body.status);
    if (!status) return apiError(400, "Invalid expense status.");
    patch.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(body, "workerId")) {
    patch.worker_id = stringOrNull(body.workerId);
  }
  if (Object.prototype.hasOwnProperty.call(body, "sourceType")) {
    const sourceType = optionalSourceType(body.sourceType);
    if (!sourceType) return apiError(400, "Invalid expense source.");
    patch.source_type = sourceType;
  }
  if (Object.prototype.hasOwnProperty.call(body, "paymentAccountId")) {
    patch.payment_account_id = stringOrNull(body.paymentAccountId);
  }
  if (Object.prototype.hasOwnProperty.call(body, "projectId")) {
    patch.project_id = stringOrNull(body.projectId);
  }
  const hasLinePatch =
    Object.prototype.hasOwnProperty.call(body, "projectId") ||
    Object.prototype.hasOwnProperty.call(body, "category") ||
    Object.prototype.hasOwnProperty.call(body, "amount");
  if (Object.keys(patch).length === 0) return apiError(400, "No expense fields to update.");

  if (
    Object.prototype.hasOwnProperty.call(body, "sourceType") &&
    expenseSourceTypeIsWorkerReimbursement(patch.source_type as string | null | undefined) &&
    !String(patch.worker_id ?? "").trim()
  ) {
    return apiError(400, "Choose a worker before saving this reimbursement expense.");
  }

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

  if (hasLinePatch) {
    const linePatch: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "projectId")) {
      linePatch.project_id = stringOrNull(body.projectId);
    }
    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      linePatch.category = nullableString(body.category) ?? "Other";
    }
    if (Object.prototype.hasOwnProperty.call(body, "amount")) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return apiError(400, "Line amount must be a valid number.");
      }
      linePatch.amount = amount;
    }

    if (Object.keys(linePatch).length > 0) {
      const { data: firstLine, error: firstLineError } = await supabase
        .from("expense_lines")
        .select("id")
        .eq("expense_id", id)
        .limit(1)
        .maybeSingle();
      if (firstLineError) {
        console.error("[expenses/:id] first line load failed", firstLineError);
        return apiError(500, "Failed to save expense line.");
      }
      if (!firstLine) return apiError(404, "Expense line not found.");
      const { data: updatedLine, error: lineError } = await supabase
        .from("expense_lines")
        .update(linePatch)
        .eq("id", firstLine.id)
        .eq("expense_id", id)
        .select("id")
        .maybeSingle();
      if (lineError) {
        console.error("[expenses/:id] line update failed", lineError);
        return apiError(500, "Failed to save expense line.");
      }
      if (!updatedLine) return apiError(404, "Expense line not found.");
    }
  }

  return NextResponse.json({ ok: true, expense: data }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id?.trim()) return apiError(400, "Missing expense id.");

  const supabase = getServerSupabaseAdmin();
  if (!supabase) {
    return apiError(
      503,
      "Expense delete is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY as a server-only environment variable."
    );
  }

  const { data: expense, error: loadError } = await supabase
    .from("expenses")
    .select("id, vendor_name, vendor, status")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    console.error("[expenses/:id] delete load failed", loadError);
    return apiError(500, loadError.message ?? "Failed to load expense before delete.");
  }
  if (!expense) return apiError(404, "Expense not found or already deleted.");

  const vendorLabel = expense.vendor_name ?? expense.vendor ?? null;
  const isTestExpense = isSafeTestExpenseVendor(vendorLabel);
  if (expenseIsArchivedDoneDbStatus(expense.status) && !isTestExpense) {
    return apiError(
      409,
      "Reviewed or approved expenses cannot be hard-deleted from the list. Use a void/archive workflow or contact an admin."
    );
  }

  const { error: attachmentsError } = await supabase
    .from("attachments")
    .delete()
    .eq("entity_type", "expense")
    .eq("entity_id", id);
  if (attachmentsError && !isMissingTable(attachmentsError)) {
    console.error("[expenses/:id] attachment metadata delete failed", attachmentsError);
    return apiError(500, attachmentsError.message ?? "Failed to delete expense attachments.");
  }

  const { error: expenseAttachmentsError } = await supabase
    .from("expense_attachments")
    .delete()
    .eq("expense_id", id);
  if (expenseAttachmentsError && !isMissingTable(expenseAttachmentsError)) {
    console.error("[expenses/:id] expense attachment delete failed", expenseAttachmentsError);
    return apiError(
      500,
      expenseAttachmentsError.message ?? "Failed to delete expense attachment metadata."
    );
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .select("id");
  if (deleteError) {
    console.error("[expenses/:id] delete failed", deleteError);
    const message = deleteError.message ?? "Failed to delete expense.";
    if (/foreign key|violates foreign key|referential/i.test(message)) {
      return apiError(
        409,
        "This expense cannot be deleted because it is referenced by another record."
      );
    }
    return apiError(500, message);
  }

  if (!deleted || deleted.length === 0)
    return apiError(404, "Expense not found or already deleted.");
  return NextResponse.json(
    {
      ok: true,
      rowsDeleted: deleted.length,
      expense: {
        id: expense.id,
        vendorName: vendorLabel,
      },
    },
    { headers: NO_CACHE_HEADERS }
  );
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
      if (Object.prototype.hasOwnProperty.call(patch, "amount")) {
        await syncExpenseHeaderAmountFromLinesWithClient(supabase, id, {
          lineId,
          amount: patch.amount as number,
        });
      }
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
      await syncExpenseHeaderAmountFromLinesWithClient(supabase, id);
      return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "add-vendor" || action === "add-category" || action === "add-payment-method") {
      const name = stringOrNull(body.name);
      if (!name) return apiError(400, "Name is required.");
      if (action === "add-category" || action === "add-payment-method") {
        const type = action === "add-category" ? "category" : "payment_method";
        const { data: existing, error: existingError } = await supabase
          .from("expense_options")
          .select("*")
          .eq("type", type)
          .ilike("name", name)
          .maybeSingle();
        if (!existingError && existing) {
          const row = existing as { id: string; name: string; active?: boolean };
          if (!row.active) {
            const { error: activateError } = await supabase
              .from("expense_options")
              .update({ active: true })
              .eq("id", row.id);
            if (activateError) throw activateError;
          }
          return NextResponse.json({ ok: true, name: row.name }, { headers: NO_CACHE_HEADERS });
        }
        if (existingError && !isMissingTable(existingError)) throw existingError;
        if (!existingError) {
          const { data: rows } = await supabase
            .from("expense_options")
            .select("sort_order")
            .eq("type", type);
          const maxSort = Array.isArray(rows)
            ? rows.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0)
            : 0;
          const { data, error } = await supabase
            .from("expense_options")
            .insert({
              type,
              key: slugKey(name),
              name,
              active: true,
              is_default: false,
              is_system: false,
              sort_order: maxSort + 10,
            })
            .select("name")
            .single();
          if (error) throw error;
          return NextResponse.json(
            { ok: true, name: data?.name ?? name },
            { headers: NO_CACHE_HEADERS }
          );
        }
      }
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
