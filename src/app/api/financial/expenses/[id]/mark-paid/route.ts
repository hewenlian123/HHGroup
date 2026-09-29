import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { getExpenseById } from "@/lib/expenses-db";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Database refusals that mean mark-paid does not apply. Other errors stay visible. */
const LEGACY_MARK_PAID_NO_OP =
  /LEGACY_UNVERIFIED|Worker Expense is read-only|Worker Expense mutation requires canonical settlement|Canonical reimbursement Expense (?:identity|line) is immutable|Expense settlement requires canonical payment/;

function isLegacyMarkPaidNoOp(message: string): boolean {
  return LEGACY_MARK_PAID_NO_OP.test(message);
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
  if (!guard.client) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503 }
    );
  }
  const expenseId = params.id?.trim();
  if (!expenseId) {
    return NextResponse.json({ ok: false, message: "Expense id is required." }, { status: 400 });
  }

  let body: { paymentAccountId?: unknown; paidOn?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const paymentAccountId =
    typeof body.paymentAccountId === "string" ? body.paymentAccountId.trim() : "";
  const paidOn =
    typeof body.paidOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.paidOn)
      ? body.paidOn
      : hawaiiTodayYmd();
  if (!paymentAccountId) {
    return NextResponse.json(
      { ok: false, message: "Choose a payment account to mark this expense paid." },
      { status: 409 }
    );
  }

  const current = await getExpenseById(expenseId, guard.client);
  if (!current) {
    return NextResponse.json({ ok: false, message: "Expense was not found." }, { status: 404 });
  }
  const status = String(current.status ?? "").toLowerCase();
  if (current.sourceType === "reimbursement" || current.workerId) {
    return NextResponse.json({ ok: true, expense: current, legacy: true });
  }
  if (!["approved", "reviewed", "done", "completed", "paid"].includes(status)) {
    return NextResponse.json(
      { ok: false, message: "Approve the expense before marking it paid." },
      { status: 409 }
    );
  }

  const { error } = await guard.client
    .from("expenses")
    .update({
      payment_account_id: paymentAccountId,
      payment_status: "paid",
      paid_on: paidOn,
    })
    .eq("id", expenseId);
  if (error) {
    if (isLegacyMarkPaidNoOp(error.message)) {
      return NextResponse.json({ ok: true, expense: current, legacy: true });
    }
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  const expense = await getExpenseById(expenseId, guard.client);
  return NextResponse.json({ ok: true, expense });
}
