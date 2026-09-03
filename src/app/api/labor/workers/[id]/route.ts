import { NextResponse } from "next/server";
import {
  requireSupabaseOwnerOrAdmin,
  requireSupabaseOwnerOrAdminRequestClient,
} from "@/lib/auth-boundary";
import { deleteWorker, updateWorker } from "@/lib/data";
import { getWorkerByIdWithClient, getWorkerUsageWithClient } from "@/lib/labor-db";
import {
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
  getServerSupabaseAdmin,
} from "@/lib/supabase-server";
import {
  getWorkerCurrentDailyRateWithClient,
  getWorkerRateHistoryWithClient,
} from "@/lib/worker-rate-history-db";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse): NextResponse {
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function GET(req: Request, { params }: RouteParams) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, message: "Worker id is required." }, { status: 400 });
  }
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }
  try {
    const [worker, usage, rateHistory, currentRate] = await Promise.all([
      getWorkerByIdWithClient(admin, id),
      getWorkerUsageWithClient(admin, id),
      getWorkerRateHistoryWithClient(admin, id),
      getWorkerCurrentDailyRateWithClient(admin, id),
    ]);
    if (!worker) {
      return NextResponse.json({ ok: false, message: "Worker not found." }, { status: 404 });
    }
    const currentDailyRate =
      currentRate.dailyRate > 0 ? currentRate.dailyRate : worker.dailyRate || worker.halfDayRate;
    return NextResponse.json({
      ok: true,
      worker: {
        ...worker,
        dailyRate: currentDailyRate,
        halfDayRate: currentDailyRate,
        currentDailyRateEffectiveFrom: currentRate.effectiveFrom,
        rateHistory,
      },
      usage,
      rateHistory,
      currentDailyRate: currentRate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/**
 * PATCH: Update a worker (uses admin client).
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, message: "Worker id is required." }, { status: 400 });
  }
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name as string)?.trim();
    const worker = await updateWorker(
      id,
      {
        ...(name !== undefined && { name }),
        ...(body.phone !== undefined && { phone: (body.phone as string)?.trim() ?? null }),
        ...((body.role !== undefined || body.trade !== undefined) && {
          trade: ((body.role ?? body.trade) as string)?.trim() ?? null,
        }),
        ...(body.half_day_rate !== undefined && { halfDayRate: Number(body.half_day_rate) }),
        ...(body.notes !== undefined && { notes: (body.notes as string)?.trim() ?? null }),
        ...(body.status === "inactive" && { status: "inactive" as const }),
        ...(body.status === "active" && { status: "active" as const }),
      },
      admin
    );
    return NextResponse.json(worker);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update worker.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/** Remove an eligible worker through the same request-scoped identity that passed Auth. */
export async function DELETE(req: Request, { params }: RouteParams) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id?.trim()) {
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Worker id is required." }, { status: 400 }),
      guard.sessionResponse
    );
  }
  try {
    const deleted = await deleteWorker(id, guard.client);
    if (!deleted) {
      return withSessionCookies(
        NextResponse.json(
          {
            ok: false,
            message:
              "Worker has labor entries or invoices and cannot be deleted. Archive the worker instead.",
          },
          { status: 409 }
        ),
        guard.sessionResponse
      );
    }
    return withSessionCookies(NextResponse.json({ ok: true }), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete worker.";
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
