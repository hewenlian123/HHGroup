import { NextResponse } from "next/server";
import { deleteWorker, updateWorker } from "@/lib/data";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH: Update a worker (uses admin client).
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, message: "Worker id is required." }, { status: 400 });
  }
  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name as string)?.trim();
    const worker = await updateWorker(id, {
      ...(name !== undefined && { name }),
      ...(body.phone !== undefined && { phone: (body.phone as string)?.trim() ?? null }),
      ...((body.role !== undefined || body.trade !== undefined) && {
        trade: ((body.role ?? body.trade) as string)?.trim() ?? null,
      }),
      ...(body.half_day_rate !== undefined && { halfDayRate: Number(body.half_day_rate) }),
      ...(body.status === "inactive" && { status: "inactive" as const }),
      ...(body.status === "active" && { status: "active" as const }),
    });
    return NextResponse.json(worker);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update worker.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/**
 * DELETE: Remove a worker (uses admin client so it matches list/clear-data).
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, message: "Worker id is required." }, { status: 400 });
  }
  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503 }
    );
  }
  try {
    await deleteWorker(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete worker.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
