import { expenseRequiresReceiptReview } from "@/lib/expense-workflow-status";
import { getExpenseTotal } from "@/lib/expense-domain";
import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { expenseHeaderMatchesLines, singleLineHeaderSyncAmount } from "@/lib/expense-header-total";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { getExpenseById, syncExpenseHeaderAmountFromLinesWithClient } from "@/lib/expenses-db";
import { settlementForApproval } from "@/lib/expense-payment-settlement";
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
  return "Choose a payment account to mark this expense paid.";
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

  let body: { settlement?: unknown; paidOn?: unknown; paymentAccountId?: unknown } = {};
  const rawBody = await request.text();
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return apiError(400, "Invalid approval payload.");
    }
  }

  const requestedAccount =
    typeof body.paymentAccountId === "string" ? body.paymentAccountId.trim() : "";

  let current = await getExpenseById(expenseId, supabase);
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

  const lineAmounts = current.lines.map((line) => Number(line.amount) || 0);
  const headerKnown = current.headerTotal != null && Number.isFinite(Number(current.headerTotal));
  if (
    current.lines.length > 1 &&
    headerKnown &&
    !expenseHeaderMatchesLines(current.headerTotal, lineAmounts)
  ) {
    return apiError(409, "Header total must equal the sum of the expense lines.");
  }
  if (
    headerKnown &&
    singleLineHeaderSyncAmount(lineAmounts) != null &&
    !expenseHeaderMatchesLines(current.headerTotal, lineAmounts)
  ) {
    try {
      await syncExpenseHeaderAmountFromLinesWithClient(supabase, expenseId);
    } catch (error) {
      return apiError(
        500,
        error instanceof Error ? error.message : "Could not sync the expense total."
      );
    }
    current = await getExpenseById(expenseId, supabase);
    if (!current) return apiError(500, "Expense total synced, but the draft could not reload.");
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
  const accountId = requestedAccount || String(current.paymentAccountId ?? "").trim();
  const settlement = settlementForApproval({
    paymentAccountId: accountId,
    settlement: typeof body.settlement === "string" ? body.settlement : null,
  });
  if (settlement === "paid" && !accountId) {
    return apiError(409, "Choose a payment account to mark this expense paid.");
  }
  const paidOn =
    typeof body.paidOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.paidOn)
      ? body.paidOn
      : hawaiiTodayYmd();
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
      settlement,
      ...(settlement === "paid" && requestedAccount
        ? { payment_account_id: requestedAccount }
        : {}),
      ...(settlement === "paid" ? { paid_on: paidOn } : {}),
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
