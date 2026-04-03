import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { updateCommission, deleteCommission, getCommissionById } from "@/lib/data";
import { uuidNormalizedEqual } from "@/lib/uuid-normalize";

const ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"];
const MODES = ["Auto", "Manual"];

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string }> }
) {
  const { id: projectId, commissionId } = await ctx.params;
  if (!projectId || !commissionId)
    return NextResponse.json(
      { ok: false, message: "Missing project or commission id" },
      { status: 400 }
    );
  try {
    const existing = await getCommissionById(commissionId);
    if (!existing)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (!uuidNormalizedEqual(existing.project_id, projectId))
      return NextResponse.json(
        { ok: false, message: "Commission does not belong to this project" },
        { status: 400 }
      );
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.person_name !== undefined) updates.person_name = String(body.person_name).trim();
    if (body.person_id !== undefined)
      updates.person_id =
        body.person_id != null && String(body.person_id).trim() !== ""
          ? String(body.person_id).trim()
          : null;
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
    if (body.notes !== undefined)
      updates.notes = body.notes != null ? String(body.notes).trim() || null : null;
    const commission = await updateCommission(
      commissionId,
      updates as Parameters<typeof updateCommission>[1]
    );
    if (!commission)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true, commission });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update commission";
    const status = /cannot be less than total payments/i.test(message)
      ? 400
      : /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
        ? 503
        : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string }> }
) {
  const { id: projectId, commissionId } = await ctx.params;
  if (!projectId || !commissionId)
    return NextResponse.json(
      { ok: false, message: "Missing project or commission id" },
      { status: 400 }
    );
  try {
    const existing = await getCommissionById(commissionId);
    if (!existing)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (!uuidNormalizedEqual(existing.project_id, projectId))
      return NextResponse.json(
        { ok: false, message: "Commission does not belong to this project" },
        { status: 400 }
      );
    await deleteCommission(commissionId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete commission";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
