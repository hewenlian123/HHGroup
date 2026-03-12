import { NextResponse } from "next/server";
import { getCommissionById, createPaymentRecord } from "@/lib/data";

const PAYMENT_METHODS = ["Check", "Bank Transfer", "Cash", "Zelle", "Other"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string }> }
) {
  const { id: projectId, commissionId } = await ctx.params;
  if (!projectId || !commissionId)
    return NextResponse.json({ ok: false, message: "Missing project or commission id" }, { status: 400 });
  try {
    const commission = await getCommissionById(commissionId);
    if (!commission) return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (commission.project_id !== projectId)
      return NextResponse.json({ ok: false, message: "Commission does not belong to this project" }, { status: 400 });
    const body = await req.json();
    const amount = Math.max(0, Number(body.amount) || 0);
    const payment_date = String(body.payment_date ?? "").slice(0, 10);
    const payment_method = PAYMENT_METHODS.includes(body.payment_method) ? body.payment_method : "Other";
    const reference_no = body.reference_no != null ? String(body.reference_no).trim() || null : null;
    const notes = body.notes != null ? String(body.notes).trim() || null : null;
    const record = await createPaymentRecord({
      commission_id: commissionId,
      project_id: projectId,
      person_name: commission.person_name,
      amount,
      payment_date,
      payment_method,
      reference_no,
      notes,
    });
    return NextResponse.json({ ok: true, record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to record payment";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
