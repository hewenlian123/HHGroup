import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { getExpenseById, syncExpenseHeaderAmountFromLinesWithClient } from "@/lib/expenses-db";
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

type Confidence = "high" | "medium" | "low";

type OcrWritebackRequest = {
  vendorName?: unknown;
  vendorConfidence?: unknown;
  amount?: unknown;
  amountConfidence?: unknown;
  date?: unknown;
  dateConfidence?: unknown;
  category?: unknown;
  ocrSource?: unknown;
};

type ExpenseDraftRow = {
  id: string;
  created_at: string | null;
  expense_date: string | null;
  vendor_name: string | null;
  vendor: string | null;
  status: string | null;
  source_type: string | null;
  receipt_url: string | null;
  reference_no: string | null;
};

type ExpenseLineDraftRow = {
  id: string;
  amount: number | string | null;
  total: number | string | null;
  category: string | null;
  project_id: string | null;
};

function apiError(status: number, message: string, detail?: string): NextResponse {
  if (detail) console.warn("[expense-ocr-writeback]", message, detail);
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeConfidence(value: unknown): Confidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function cleanVendor(value: unknown): string | null {
  const vendor = optionalString(value);
  if (!vendor) return null;
  if (/^(unknown|unknown vendor|needs review)$/i.test(vendor)) return null;
  if (!/[A-Za-z\u4e00-\u9fff]/.test(vendor)) return null;
  return vendor.slice(0, 160);
}

function isPlaceholderVendor(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return !v || /^(unknown|unknown vendor|needs review)$/i.test(v);
}

function parseUsableAmount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 9_999_999) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded >= 1900 && rounded <= 2100 && Number.isInteger(rounded)) return null;
  return rounded;
}

function isPlaceholderAmount(value: unknown): boolean {
  const n = Number(value ?? 0);
  return !Number.isFinite(n) || n <= 0.011;
}

function normalizeIsoDate(value: unknown): string | null {
  const raw = optionalString(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  if (y < 2000) return null;
  const today = new Date();
  const endToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
    999
  );
  if (dt > endToday) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function isoDateOnly(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .slice(0, 10);
}

function currentDateIsPlaceholder(row: ExpenseDraftRow): boolean {
  const current = isoDateOnly(row.expense_date);
  if (!current) return true;
  const today = new Date().toISOString().slice(0, 10);
  const created = isoDateOnly(row.created_at);
  return current === today || (created !== "" && current === created);
}

function cleanCategory(value: unknown): string | null {
  const category = optionalString(value);
  if (!category) return null;
  if (category === "—") return null;
  return category.slice(0, 120);
}

function isPlaceholderCategory(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return !v || v === "—" || /^other$/i.test(v);
}

function draftStatusAllowed(status: string | null | undefined): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return !s || s === "draft" || s === "needs_review" || s === "pending" || s === "unreviewed";
}

function isInboxReceiptDraft(row: ExpenseDraftRow): boolean {
  const source = String(row.source_type ?? "")
    .trim()
    .toLowerCase();
  const ref = String(row.reference_no ?? "");
  return source === "receipt_upload" || /^INBOX-UP-/i.test(ref);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdminWithClient(
    request,
    getServerSupabaseInternalNoStore
  );
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const expenseId = params.id?.trim();
  if (!expenseId) return apiError(400, "Expense id is required.");

  let body: OcrWritebackRequest;
  try {
    body = (await request.json()) as OcrWritebackRequest;
  } catch {
    return apiError(400, "Invalid OCR writeback payload.");
  }

  const { data: expenseRow, error: expenseError } = await supabase
    .from("expenses")
    .select(
      "id,created_at,expense_date,vendor_name,vendor,status,source_type,receipt_url,reference_no"
    )
    .eq("id", expenseId)
    .maybeSingle();

  if (expenseError) {
    return apiError(500, "Could not load draft expense for OCR.", expenseError.message);
  }
  if (!expenseRow) return apiError(404, "Draft expense was not found.");

  const draft = expenseRow as ExpenseDraftRow;
  if (!draftStatusAllowed(draft.status)) {
    return apiError(409, "Receipt OCR can only update draft or review expenses.");
  }
  if (!isInboxReceiptDraft(draft)) {
    return apiError(409, "Receipt OCR can only update Inbox receipt drafts.");
  }

  const { data: lineRows, error: lineError } = await supabase
    .from("expense_lines")
    .select("id,amount,total,category,project_id")
    .eq("expense_id", expenseId)
    .limit(1);

  if (lineError) {
    return apiError(500, "Could not load draft expense line for OCR.", lineError.message);
  }
  const line = Array.isArray(lineRows) ? (lineRows[0] as ExpenseLineDraftRow | undefined) : null;
  if (!line?.id) return apiError(409, "Draft expense has no editable line.");

  const changedFields: string[] = [];
  const expenseUpdates: Record<string, unknown> = {};
  const lineUpdates: Record<string, unknown> = {};

  const vendorConfidence = normalizeConfidence(body.vendorConfidence);
  const vendor = cleanVendor(body.vendorName);
  if (
    vendor &&
    vendorConfidence !== "low" &&
    isPlaceholderVendor(draft.vendor_name ?? draft.vendor)
  ) {
    expenseUpdates.vendor_name = vendor;
    expenseUpdates.vendor = vendor;
    changedFields.push("vendor");
  }

  const amountConfidence = normalizeConfidence(body.amountConfidence);
  const amount = parseUsableAmount(body.amount);
  if (amount != null && amountConfidence === "high" && isPlaceholderAmount(line.amount)) {
    lineUpdates.amount = amount;
    changedFields.push("amount");
  }

  const dateConfidence = normalizeConfidence(body.dateConfidence);
  const date = normalizeIsoDate(body.date);
  if (date && dateConfidence !== "low" && currentDateIsPlaceholder(draft)) {
    expenseUpdates.expense_date = date;
    changedFields.push("date");
  }

  const category = cleanCategory(body.category);
  if (category && !/^other$/i.test(category) && isPlaceholderCategory(line.category)) {
    lineUpdates.category = category;
    changedFields.push("category");
  }

  if (Object.keys(expenseUpdates).length > 0) {
    const { error } = await supabase.from("expenses").update(expenseUpdates).eq("id", expenseId);
    if (error) return apiError(500, "Could not save receipt OCR fields.", error.message);
  }

  if (Object.keys(lineUpdates).length > 0) {
    const { error } = await supabase
      .from("expense_lines")
      .update(lineUpdates)
      .eq("id", line.id)
      .eq("expense_id", expenseId);
    if (error) return apiError(500, "Could not save receipt OCR line fields.", error.message);
    if (lineUpdates.amount != null) {
      try {
        await syncExpenseHeaderAmountFromLinesWithClient(supabase, expenseId, {
          lineId: line.id,
          amount: lineUpdates.amount as number,
        });
      } catch (syncError) {
        return apiError(
          500,
          "Could not sync receipt OCR amount to the expense header.",
          syncError instanceof Error ? syncError.message : undefined
        );
      }
    }
  }

  const updated = await getExpenseById(expenseId, supabase);
  if (!updated) return apiError(500, "Receipt OCR fields saved, but the draft could not reload.");

  return NextResponse.json(
    {
      ok: true,
      expense: updated,
      changedFields,
      message:
        changedFields.length > 0
          ? "Receipt OCR fields were applied."
          : "Receipt OCR found no safe fields to apply.",
    },
    { headers: NO_CACHE_HEADERS }
  );
}
