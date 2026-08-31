import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import {
  getServerSupabaseAdminNoStore,
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
} from "@/lib/supabase-server";
import {
  getReimbursementById,
  recordReimbursementPaymentAtomicWithClient,
} from "@/lib/worker-reimbursements-db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseAdminNoStore);
  if (!guard.ok) return guard.response;

  const { id: reimbursementId } = await params;
  const supabase = guard.client;
  if (!supabase) {
    return NextResponse.json(
      { message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const existing = await getReimbursementById(reimbursementId, supabase);
    if (!existing) {
      return NextResponse.json({ message: "Reimbursement not found." }, { status: 404 });
    }

    const result = await recordReimbursementPaymentAtomicWithClient(
      [reimbursementId],
      {
        idempotencyKey: `reimbursement-pay:${reimbursementId}`,
        paymentMethod: body?.method ?? null,
        note: body?.note ?? null,
      },
      supabase
    );
    return NextResponse.json({
      reimbursement: result.reimbursements[0],
      payment: result.payment,
      expenseId: result.expenseIds[0],
      expenseWarning: null,
      reused: result.reused,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to record payment";
    return NextResponse.json({ message }, { status: 400 });
  }
}
