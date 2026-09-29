import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { getExpenseById } from "@/lib/expenses-db";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  let body: { lineId?: unknown; reimbursable?: unknown };
  try {
    body = (await request.json()) as { lineId?: unknown; reimbursable?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid payload." }, { status: 400 });
  }
  const result = await guard.client.rpc("set_expense_line_client_reimbursable", {
    p_expense_id: expenseId,
    p_line_id: typeof body.lineId === "string" && body.lineId ? body.lineId : null,
    p_reimbursable: body.reimbursable === true,
  });
  if (result.error) {
    return NextResponse.json({ ok: false, message: result.error.message }, { status: 409 });
  }
  const expense = await getExpenseById(expenseId, guard.client);
  return NextResponse.json({ ok: true, expense });
}
