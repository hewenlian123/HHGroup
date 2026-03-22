import { NextResponse } from "next/server";
import { updateCommission, deleteCommission, getCommissionById } from "@/lib/data";

const ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"];
const MODES = ["Auto", "Manual"];
const STATUSES = ["Pending", "Approved", "Paid", "Cancelled"];

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string }> }
) {
  const { commissionId } = await ctx.params;
  if (!commissionId)
    return NextResponse.json({ ok: false, message: "Missing commission id" }, { status: 400 });
  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.person_name !== undefined) updates.person_name = String(body.person_name).trim();
    if (body.role !== undefined) updates.role = ROLES.includes(body.role) ? body.role : "Other";
    if (body.calculation_mode !== undefined)
      updates.calculation_mode = MODES.includes(body.calculation_mode)
        ? body.calculation_mode
        : "Auto";
    if (body.rate !== undefined) updates.rate = Math.max(0, Number(body.rate) || 0);
    if (body.base_amount !== undefined)
      updates.base_amount = Math.max(0, Number(body.base_amount) || 0);
    if (body.commission_amount !== undefined)
      updates.commission_amount = Math.max(0, Number(body.commission_amount) || 0);
    if (body.status !== undefined)
      updates.status = STATUSES.includes(body.status) ? body.status : "Pending";
    if (body.notes !== undefined)
      updates.notes = body.notes != null ? String(body.notes).trim() || null : null;
    const commission = await updateCommission(
      commissionId,
      updates as Parameters<typeof updateCommission>[1]
    );
    if (!commission)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    return NextResponse.json({ ok: true, commission });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update commission";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string }> }
) {
  const { commissionId } = await ctx.params;
  if (!commissionId)
    return NextResponse.json({ ok: false, message: "Missing commission id" }, { status: 400 });
  try {
    const existing = await getCommissionById(commissionId);
    if (!existing)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    await deleteCommission(commissionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete commission";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
