import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import {
  addExpenseAttachmentWithClient,
  createQuickExpenseWithClient,
  type Expense,
  type ExpenseAttachment,
} from "@/lib/expenses-db";

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

export async function POST(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  let body: QuickExpenseRequest;
  try {
    body = (await request.json()) as QuickExpenseRequest;
  } catch {
    return apiError(400, "Invalid quick expense payload.");
  }

  const vendorName = optionalString(body.vendorName) ?? "Unknown";
  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return apiError(400, "Quick expense amount must be a valid number.");
  }

  try {
    let expense = await createQuickExpenseWithClient(supabase, {
      date: optionalString(body.date) ?? new Date().toISOString().slice(0, 10),
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
    });

    for (const attachment of normalizeAttachments(body.attachments)) {
      expense = (await addExpenseAttachmentWithClient(supabase, expense.id, attachment)) ?? expense;
    }

    return NextResponse.json({ ok: true, expense }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save quick expense.";
    return apiError(500, message);
  }
}
