import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import {
  addExpenseAttachmentWithClient,
  createQuickExpenseWithClient,
  getExpenseById,
  type Expense,
  type ExpenseAttachment,
} from "@/lib/expenses-db";
import type { SubcontractDeductionInput } from "@/lib/subcontract-deductions-db";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { isInboxUploadExpenseReference } from "@/lib/inbox-upload-constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

type QuickExpenseRequest = {
  date?: unknown;
  vendorName?: unknown;
  totalAmount?: unknown;
  receiptUrl?: unknown;
  sourceType?: unknown;
  category?: unknown;
  initialStatus?: unknown;
  notes?: unknown;
  projectId?: unknown;
  paymentAccountId?: unknown;
  referenceNo?: unknown;
  attachments?: unknown;
  subcontractDeduction?: unknown;
  idempotencyKey?: unknown;
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSourceType(value: unknown): "company" | "receipt_upload" | "reimbursement" {
  if (value === "receipt_upload" || value === "reimbursement") return value;
  return "company";
}

function normalizeStatus(value: unknown): NonNullable<Expense["status"]> | undefined {
  if (
    value === "pending" ||
    value === "needs_review" ||
    value === "reviewed" ||
    value === "approved" ||
    value === "reimbursed" ||
    value === "reimbursable" ||
    value === "paid" ||
    value === "draft"
  ) {
    return value;
  }
  return undefined;
}

function normalizeAttachments(value: unknown): ExpenseAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ExpenseAttachment | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const url = optionalString(row.url);
      if (!url) return null;
      return {
        id: optionalString(row.id) ?? crypto.randomUUID(),
        fileName: optionalString(row.fileName) ?? "receipt",
        mimeType: optionalString(row.mimeType) ?? "image/jpeg",
        size: Number(row.size) || 0,
        url,
        createdAt: optionalString(row.createdAt) ?? new Date().toISOString(),
      };
    })
    .filter((item): item is ExpenseAttachment => Boolean(item));
}

function normalizeSubcontractDeduction(value: unknown): SubcontractDeductionInput | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.enabled === false) return null;
  return {
    subcontractId: optionalString(row.subcontractId),
    subcontractorId: optionalString(row.subcontractorId),
    projectId: optionalString(row.projectId),
    amount:
      typeof row.amount === "number" || typeof row.amount === "string" ? row.amount : undefined,
    note: optionalString(row.note),
  };
}

export async function POST(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(
    request,
    getServerSupabaseInternalNoStore
  );
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  let body: QuickExpenseRequest;
  try {
    body = (await request.json()) as QuickExpenseRequest;
  } catch {
    return apiError(400, "Invalid quick expense payload.");
  }

  const vendorName = optionalString(body.vendorName) ?? "Unknown";
  const idempotencyKey = optionalString(body.idempotencyKey);
  if (!idempotencyKey) return apiError(400, "Expense idempotency key is required.");
  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return apiError(400, "Quick expense amount must be a valid number.");
  }

  try {
    const deduction = normalizeSubcontractDeduction(body.subcontractDeduction);
    const referenceNo = optionalString(body.referenceNo);
    let expense: Expense | null = null;
    if (
      body.sourceType === "receipt_upload" &&
      referenceNo &&
      /^INBOX-UP-[a-f0-9]{64}$/i.test(referenceNo)
    ) {
      const existing = await supabase
        .from("expenses")
        .select("id, source_type")
        .eq("reference_no", referenceNo)
        .maybeSingle();
      if (existing.error) throw new Error("Receipt recovery lookup unavailable.");
      if (existing.data) {
        if (existing.data.source_type !== "receipt_upload")
          return apiError(409, "Receipt reference conflicts with another expense.");
        expense = await getExpenseById(existing.data.id, supabase);
        if (!expense) throw new Error("Receipt recovery unavailable.");
      }
    }
    expense ??= await createQuickExpenseWithClient(supabase, {
      date: optionalString(body.date) ?? hawaiiTodayYmd(),
      vendorName,
      totalAmount,
      receiptUrl: optionalString(body.receiptUrl),
      sourceType: normalizeSourceType(body.sourceType),
      category: optionalString(body.category) ?? undefined,
      initialStatus: normalizeStatus(body.initialStatus),
      notes: optionalString(body.notes) ?? undefined,
      projectId: optionalString(body.projectId),
      paymentAccountId: optionalString(body.paymentAccountId),
      referenceNo: optionalString(body.referenceNo),
      idempotencyKey,
      subcontractDeduction: deduction
        ? {
            ...deduction,
            projectId: deduction.projectId ?? optionalString(body.projectId),
            amount: deduction.amount ?? totalAmount,
          }
        : null,
    });

    for (const attachment of normalizeAttachments(body.attachments)) {
      const attached = await addExpenseAttachmentWithClient(supabase, expense.id, attachment);
      if (!attached) throw new Error("Receipt metadata saved, but expense reload is unavailable.");
      expense = attached;
    }

    if (
      normalizeSourceType(body.sourceType) === "receipt_upload" &&
      referenceNo &&
      isInboxUploadExpenseReference(referenceNo)
    ) {
      const fingerprint = referenceNo.slice("INBOX-UP-".length).toLowerCase();
      const stamped = await supabase
        .from("expenses")
        .update({
          file_sha256: fingerprint,
          inbox_capture: true,
          ocr_status: "pending",
          ocr_error: null,
        })
        .eq("id", expense.id);
      if (stamped.error && !/column|schema cache/i.test(stamped.error.message)) {
        throw new Error(stamped.error.message);
      }
    }

    return NextResponse.json({ ok: true, expense }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save quick expense.";
    return apiError(500, message);
  }
}
