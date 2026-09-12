import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import {
  getServerSupabaseAdminNoStore,
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
} from "@/lib/supabase-server";
import { recordReimbursementPaymentAtomicWithClient } from "@/lib/worker-reimbursements-db";

/**
 * POST: Create a worker payment for multiple pending reimbursements (same worker).
 * Marks them paid and creates one Project Expense per reimbursement (category: Worker Reimbursement).
 * Body: { reimbursementIds: string[], paymentMethod?: string, note?: string }
 */
export async function POST(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseAdminNoStore);
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) {
    return NextResponse.json(
      { message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const intent = body.idempotency_key;
    if (
      intent !== undefined &&
      (typeof intent !== "string" || !intent.trim() || intent.length > 160)
    ) {
      return NextResponse.json({ message: "Invalid payment intent." }, { status: 400 });
    }

    if (
      body.paymentDate !== undefined &&
      (typeof body.paymentDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate) ||
        Number.isNaN(Date.parse(body.paymentDate)) ||
        new Date(body.paymentDate).toISOString().slice(0, 10) !== body.paymentDate)
    ) {
      return NextResponse.json({ message: "Invalid payment date." }, { status: 400 });
    }
    const ids = body?.reimbursementIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { message: "Provide at least one reimbursement id." },
        { status: 400 }
      );
    }
    const reimbursementIds = ids.filter((id): id is string => typeof id === "string");
    if (reimbursementIds.length === 0) {
      return NextResponse.json({ message: "Invalid reimbursement ids." }, { status: 400 });
    }
    const stableIds = [...reimbursementIds].sort();
    const idempotencyKey = `reimbursement-pay:${createHash("sha256")
      .update(stableIds.join(","))
      .digest("hex")}`;
    const { payment, updatedCount, expenseIds, reused } =
      await recordReimbursementPaymentAtomicWithClient(
        reimbursementIds,
        {
          idempotencyKey: intent ? `reimbursement-intent:${intent.trim()}` : idempotencyKey,
          paymentMethod: body?.paymentMethod ?? null,
          note: body?.note ?? null,
          paymentDate: body.paymentDate,
        },
        supabase
      );
    return NextResponse.json({ payment, updatedCount, expenseIds, reused });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create payment";
    return NextResponse.json({ message }, { status: 400 });
  }
}
