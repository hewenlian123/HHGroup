import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request): Promise<NextResponse> {
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
  let body: { lineIds?: unknown; reimbursedOn?: unknown; amount?: unknown; paymentId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid payload." }, { status: 400 });
  }
  const lineIds = Array.isArray(body.lineIds)
    ? body.lineIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const paymentId =
    typeof body.paymentId === "string" && body.paymentId.trim() ? body.paymentId.trim() : null;
  const result = await guard.client.rpc("settle_client_reimbursement", {
    p_line_ids: lineIds,
    p_reimbursed_on: typeof body.reimbursedOn === "string" ? body.reimbursedOn : null,
    p_amount: Number(body.amount),
    p_payment_id: paymentId,
  });
  if (result.error) {
    return NextResponse.json({ ok: false, message: result.error.message }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
