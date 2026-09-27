import { expenseRequiresReceiptReview } from "@/lib/expense-workflow-status";
import { getExpenseTotal } from "@/lib/expense-domain";
import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { getExpenseById } from "@/lib/expenses-db";
import {
  expenseNeedsReviewFromDb,
  expenseSourceTypeIsWorkerReimbursement,
  validateApproveInboxUploadDraft,
} from "@/lib/expense-workflow-status";
import { SUPABASE_MISSING_SERVER_ENV_MESSAGE } from "@/lib/supabase-server";

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
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const expenseId = id?.trim();
  if (!expenseId) return apiError(400, "Expense id is required.");

  const supabase = guard.client;
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const current = await getExpenseById(expenseId, supabase);
  if (!current) return apiError(404, "Inbox draft was not found.");

  if (!expenseRequiresReceiptReview(current)) {
    return apiError(409, "Only Inbox receipt drafts can be approved here.");
  }

  if (!expenseNeedsReviewFromDb(current.status)) {
    return apiError(409, "This Inbox draft is already approved or done.");
  }

  if (expenseSourceTypeIsWorkerReimbursement(current.sourceType)) {
    return apiError(
      409,
      "BLOCKED: Expense reimbursement bridge is retired. Use canonical Receipt approval."
    );
  }

  const total = getExpenseTotal(current);
  if (!Number.isFinite(total) || total <= 0)
    return apiError(409, "Amount must be greater than 0 before approval.");

  const gate = validateApproveInboxUploadDraft(current);
  if (gate) return apiError(409, gateMessage(gate));

  const state = await supabase
    .from("expense_operations")
    .select("revision")
    .eq("expense_id", expenseId)
    .maybeSingle();
  if (state.error) return apiError(503, "Review state is unavailable.", state.error.message);
  const { error } = await supabase.rpc("transition_expense_operation", {
    p_expense_id: expenseId,
    p_expected_revision: state.data?.revision ?? 0,
    p_request_id: crypto.randomUUID(),
    p_action: "approve",
    p_payload: {
      cost_allocation:
        current.lines.some((line) => line.projectId) || current.headerProjectId
          ? "project_cost"
          : "overhead",
    },
  });
  if (error)
    return apiError(error.code === "40001" || error.code === "23514" ? 409 : 500, error.message);

  const updated = await getExpenseById(expenseId, supabase);
  if (!updated) return apiError(500, "Inbox draft approved, but the expense could not reload.");

  return NextResponse.json(
    { ok: true, expense: updated, message: "Inbox draft approved." },
    { headers: NO_CACHE_HEADERS }
  );
}
