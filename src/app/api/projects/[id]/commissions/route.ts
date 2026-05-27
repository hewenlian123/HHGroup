import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createCommission, getCommissionsWithPaidByProject } from "@/lib/data";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";

const ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"];
const MODES = ["Auto", "Manual"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) {
    return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  }
  try {
    const commissions = await getCommissionsWithPaidByProject(projectId);
    return NextResponse.json({ ok: true, commissions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load commissions";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const projectId = String(id ?? "").trim();
  if (!projectId)
    return NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 });
  try {
    const body = await req.json();
    const person_name = String(body.person_name ?? "").trim();
    if (!person_name) {
      return NextResponse.json({ ok: false, message: "Person is required" }, { status: 400 });
    }
    const person_id =
      body.person_id != null && String(body.person_id).trim() !== ""
        ? String(body.person_id).trim()
        : null;
    const role = ROLES.includes(body.role) ? body.role : "Other";
    const calculation_mode = MODES.includes(body.calculation_mode) ? body.calculation_mode : "Auto";
    const rate = Math.max(0, Number(body.rate) || 0);
    const base_amount = Math.max(0, Number(body.base_amount) || 0);
    const commission_amount =
      calculation_mode === "Auto"
        ? Math.round(base_amount * rate * 100) / 100
        : Math.max(0, Number(body.commission_amount) || 0);
    if (!Number.isFinite(commission_amount) || commission_amount <= 0) {
      return NextResponse.json(
        { ok: false, message: "Commission amount is required" },
        { status: 400 }
      );
    }
    const notes = body.notes != null ? String(body.notes).trim() || null : null;
    const commission = await createCommission(
      projectId,
      {
        person_name,
        person_id,
        role,
        calculation_mode,
        rate,
        base_amount,
        commission_amount,
        notes,
      },
      getServerSupabaseInternalNoStore() ?? undefined
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true, commission });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create commission";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
