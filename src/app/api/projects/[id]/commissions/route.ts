import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { createCommission, getCommissionsWithPaidByProject } from "@/lib/data";

const ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"];
const MODES = ["Auto", "Manual"];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(req, {
    projectId: (await ctx.params).id,
    write: req.method !== "GET",
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) {
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 }),
      guard.sessionResponse
    );
  }
  try {
    const commissions = await getCommissionsWithPaidByProject(projectId, guard.client);
    const response = withSessionCookies(
      NextResponse.json({ ok: true, commissions }),
      guard.sessionResponse
    );

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load commissions";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status }),
      guard.sessionResponse
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOrganizationRequestClient(req, {
    projectId: (await ctx.params).id,
    write: req.method !== "GET",
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const projectId = String(id ?? "").trim();
  if (!projectId)
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing project id" }, { status: 400 }),
      guard.sessionResponse
    );
  try {
    const body = await req.json();
    const person_name = String(body.person_name ?? "").trim();
    if (!person_name) {
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Person is required" }, { status: 400 }),
        guard.sessionResponse
      );
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
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Commission amount is required" }, { status: 400 }),
        guard.sessionResponse
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
      guard.client
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return withSessionCookies(NextResponse.json({ ok: true, commission }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create commission";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status }),
      guard.sessionResponse
    );
  }
}
