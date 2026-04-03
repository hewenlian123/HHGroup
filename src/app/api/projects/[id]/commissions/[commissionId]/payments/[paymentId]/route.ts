import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getCommissionById,
  getPaymentRecordById,
  getSumPaidForCommission,
  updatePaymentRecord,
  deletePaymentRecord,
} from "@/lib/data";
import { uuidNormalizedEqual } from "@/lib/uuid-normalize";

const PAYMENT_METHODS = ["Check", "Bank Transfer", "Cash", "Zelle", "Other"];

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string; paymentId: string }> }
) {
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });
  try {
    const commission = await getCommissionById(commissionId);
    if (!commission)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return NextResponse.json(
        { ok: false, message: "Commission does not belong to this project" },
        { status: 400 }
      );
    const existing = await getPaymentRecordById(paymentId);
    if (!existing)
      return NextResponse.json({ ok: false, message: "Payment not found" }, { status: 404 });
    if (!uuidNormalizedEqual(existing.commission_id, commissionId))
      return NextResponse.json(
        { ok: false, message: "Payment does not match commission" },
        { status: 400 }
      );
    const body = await req.json();
    const amount = body.amount !== undefined ? Math.max(0, Number(body.amount) || 0) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      return NextResponse.json(
        { ok: false, message: "Amount must be greater than zero." },
        { status: 400 }
      );
    }
    const payment_date =
      body.payment_date !== undefined ? String(body.payment_date ?? "").slice(0, 10) : undefined;
    const payment_method =
      body.payment_method !== undefined
        ? PAYMENT_METHODS.includes(body.payment_method)
          ? body.payment_method
          : "Other"
        : undefined;
    const note =
      body.note !== undefined
        ? body.note != null
          ? String(body.note).trim() || null
          : null
        : body.notes !== undefined
          ? body.notes != null
            ? String(body.notes).trim() || null
            : null
          : undefined;
    const receipt_url =
      body.receipt_url !== undefined
        ? body.receipt_url === null || body.receipt_url === ""
          ? null
          : String(body.receipt_url).trim() || null
        : undefined;

    const amountFinal = amount !== undefined ? amount : existing.amount;
    const paidTotal = await getSumPaidForCommission(commissionId);
    const nextTotal = paidTotal - existing.amount + amountFinal;
    if (nextTotal > commission.commission_amount + 1e-6) {
      return NextResponse.json(
        { ok: false, message: "Total payments cannot exceed the commission amount." },
        { status: 400 }
      );
    }

    const record = await updatePaymentRecord(paymentId, {
      ...(amount !== undefined ? { amount } : {}),
      ...(payment_date !== undefined ? { payment_date } : {}),
      ...(payment_method !== undefined ? { payment_method } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(receipt_url !== undefined ? { receipt_url } : {}),
    });
    if (!record)
      return NextResponse.json({ ok: false, message: "Failed to update payment" }, { status: 500 });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true, record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update payment";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string; paymentId: string }> }
) {
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });
  try {
    const commission = await getCommissionById(commissionId);
    if (!commission)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return NextResponse.json(
        { ok: false, message: "Commission does not belong to this project" },
        { status: 400 }
      );
    const existing = await getPaymentRecordById(paymentId);
    if (!existing)
      return NextResponse.json({ ok: false, message: "Payment not found" }, { status: 404 });
    if (!uuidNormalizedEqual(existing.commission_id, commissionId))
      return NextResponse.json(
        { ok: false, message: "Payment does not match commission" },
        { status: 400 }
      );
    await deletePaymentRecord(paymentId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete payment";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
