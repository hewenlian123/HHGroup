import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  ensureWorkerReimbursementForApprovedExpense,
  getExpenseById,
  syncExpenseHeaderAmountFromLinesWithClient,
} from "@/lib/expenses-db";
import {
  expenseNeedsReviewFromDb,
  validateApproveInboxUploadDraft,
} from "@/lib/expense-workflow-status";
import { isInboxUploadExpenseReference } from "@/lib/inbox-upload-constants";
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

function apiError(status: number, message: string, detail?: string): NextResponse {
  if (detail) console.warn("[expense-approve-inbox]", message, detail);
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function gateMessage(gate: "project" | "category" | "payment" | "worker"): string {
  if (gate === "project") return "Choose a project before approving this Inbox draft.";
  if (gate === "category") return "Choose a category before approving this Inbox draft.";
  if (gate === "worker") return "Choose a worker before approving this reimbursement draft.";
  return "Choose a payment account before approving this Inbox draft.";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const expenseId = id?.trim();
  if (!expenseId) return apiError(400, "Expense id is required.");

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const current = await getExpenseById(expenseId, supabase);
  if (!current) return apiError(404, "Inbox draft was not found.");

  if (!isInboxUploadExpenseReference(current.referenceNo)) {
    return apiError(409, "Only Inbox receipt drafts can be approved here.");
  }

  if (!expenseNeedsReviewFromDb(current.status)) {
    return apiError(409, "This Inbox draft is already approved or done.");
  }

  const gate = validateApproveInboxUploadDraft(current);
  if (gate) return apiError(409, gateMessage(gate));

  try {
    await syncExpenseHeaderAmountFromLinesWithClient(supabase, expenseId);
  } catch (syncError) {
    return apiError(
      500,
      "Could not sync Inbox draft amount before approval.",
      syncError instanceof Error ? syncError.message : String(syncError)
    );
  }

  const { error } = await supabase
    .from("expenses")
    .update({ status: "approved" })
    .eq("id", expenseId);
  if (error) return apiError(500, "Could not approve Inbox draft.", error.message);

  try {
    await ensureWorkerReimbursementForApprovedExpense(expenseId, supabase);
  } catch (bridgeError) {
    return apiError(
      500,
      "Inbox draft approved, but worker reimbursement could not be created.",
      bridgeError instanceof Error ? bridgeError.message : String(bridgeError)
    );
  }

  const updated = await getExpenseById(expenseId, supabase);
  if (!updated) return apiError(500, "Inbox draft approved, but the expense could not reload.");

  return NextResponse.json(
    { ok: true, expense: updated, message: "Inbox draft approved." },
    { headers: NO_CACHE_HEADERS }
  );
}
