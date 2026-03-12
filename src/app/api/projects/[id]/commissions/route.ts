import { NextResponse } from "next/server";
import { createCommission } from "@/lib/data";

const ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"];
const MODES = ["Auto", "Manual"];
const STATUSES = ["Pending", "Approved", "Paid", "Cancelled"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json();
    const person_name = String(body.person_name ?? "").trim();
    const role = ROLES.includes(body.role) ? body.role : "Other";
    const calculation_mode = MODES.includes(body.calculation_mode) ? body.calculation_mode : "Auto";
    const rate = Math.max(0, Number(body.rate) || 0);
    const base_amount = Math.max(0, Number(body.base_amount) || 0);
    const commission_amount = Math.max(0, Number(body.commission_amount) || 0);
    const status = STATUSES.includes(body.status) ? body.status : "Pending";
    const notes = body.notes != null ? String(body.notes).trim() || null : null;
    const commission = await createCommission(projectId, {
      person_name,
      role,
      calculation_mode,
      rate,
      base_amount,
      commission_amount,
      status,
      notes,
    });
    return NextResponse.json({ ok: true, commission });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create commission";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
