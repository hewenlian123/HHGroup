import { withSessionCookies } from "@/lib/supabase-response";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
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
  const guard = await requireOrganizationRequestClient(req, {
    projectId: (await ctx.params).id,
    write: req.method !== "GET",
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 }),
      guard.sessionResponse
    );
  try {
    const commission = await getCommissionById(commissionId, guard.client);
    if (!commission)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 }),
        guard.sessionResponse
      );
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Commission does not belong to this project" },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    const existing = await getPaymentRecordById(paymentId, guard.client);
    if (!existing)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Payment not found" }, { status: 404 }),
        guard.sessionResponse
      );
    if (!uuidNormalizedEqual(existing.commission_id, commissionId))
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Payment does not match commission" },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    const body = await req.json();
    const amount = body.amount !== undefined ? Math.max(0, Number(body.amount) || 0) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Amount must be greater than zero." },
          { status: 400 }
        ),
        guard.sessionResponse
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
    const amountFinal = amount !== undefined ? amount : existing.amount;
    const internalClient = guard.client;
    const paidTotal = await getSumPaidForCommission(commissionId, internalClient);
    const nextTotal = paidTotal - existing.amount + amountFinal;
    if (nextTotal > commission.commission_amount + 1e-6) {
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Total payments cannot exceed the commission amount." },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    }

    const record = await updatePaymentRecord(
      paymentId,
      {
        ...(amount !== undefined ? { amount } : {}),
        ...(payment_date !== undefined ? { payment_date } : {}),
        ...(payment_method !== undefined ? { payment_method } : {}),
        ...(note !== undefined ? { note } : {}),
      },
      internalClient
    );
    if (!record)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Failed to update payment" }, { status: 500 }),
        guard.sessionResponse
      );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return withSessionCookies(NextResponse.json({ ok: true, record }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update payment";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status }),
      guard.sessionResponse
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string; paymentId: string }> }
) {
  const guard = await requireOrganizationRequestClient(req, {
    projectId: (await ctx.params).id,
    write: req.method !== "GET",
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 }),
      guard.sessionResponse
    );
  try {
    const commission = await getCommissionById(commissionId, guard.client);
    if (!commission)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 }),
        guard.sessionResponse
      );
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Commission does not belong to this project" },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    const existing = await getPaymentRecordById(paymentId, guard.client);
    if (!existing)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Payment not found" }, { status: 404 }),
        guard.sessionResponse
      );
    if (!uuidNormalizedEqual(existing.commission_id, commissionId))
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Payment does not match commission" },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    await deletePaymentRecord(paymentId, guard.client);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return withSessionCookies(NextResponse.json({ ok: true }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete payment";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status }),
      guard.sessionResponse
    );
  }
}
