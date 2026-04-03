import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getCommissionById,
  createPaymentRecord,
  getPaymentRecordsByCommissionId,
} from "@/lib/data";
import { uuidNormalizedEqual } from "@/lib/uuid-normalize";

const PAYMENT_METHODS = ["Check", "Bank Transfer", "Cash", "Zelle", "Other"];

export async function GET(
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
    const commission = await getCommissionById(commissionId);
    if (!commission)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return NextResponse.json(
        { ok: false, message: "Commission does not belong to this project" },
        { status: 400 }
      );
    const records = await getPaymentRecordsByCommissionId(commissionId);
    return NextResponse.json({ ok: true, records });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load payments";
    const connFail = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(
      message
    );
    const schemaMissing = /schema cache|Could not find the table|relation .+ does not exist/i.test(
      message
    );
    const status = connFail || schemaMissing ? 503 : 500;
    const hint = schemaMissing
      ? " Run Supabase migrations (e.g. `npx supabase db push` / `db reset --local`) or POST /api/ensure-schema with SUPABASE_DATABASE_URL set, then retry."
      : "";
    return NextResponse.json({ ok: false, message: message + hint }, { status });
  }
}

export async function POST(
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
    const commission = await getCommissionById(commissionId);
    if (!commission)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return NextResponse.json(
        { ok: false, message: "Commission does not belong to this project" },
        { status: 400 }
      );
    const body = await req.json();
    const amount = Math.max(0, Number(body.amount) || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, message: "Amount must be greater than zero." },
        { status: 400 }
      );
    }
    const payment_date = String(body.payment_date ?? "").slice(0, 10);
    const payment_method = PAYMENT_METHODS.includes(body.payment_method)
      ? body.payment_method
      : "Other";
    const note =
      body.note != null
        ? String(body.note).trim() || null
        : body.notes != null
          ? String(body.notes).trim() || null
          : null;
    const record = await createPaymentRecord({
      commission_id: commissionId,
      amount,
      payment_date,
      payment_method,
      note,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true, record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to record payment";
    const status = /exceed the commission amount/i.test(message)
      ? 400
      : /fetch failed|connection failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(
            message
          )
        ? 503
        : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
