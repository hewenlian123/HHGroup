import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  getServerSupabaseInternalNoStore,
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
} from "@/lib/supabase-server";
import { applyWorkerRateToUnpaidLaborEntriesWithClient } from "@/lib/worker-rate-history-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

type RouteParams = { params: Promise<{ id: string }> };

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

export async function POST(req: Request, { params }: RouteParams) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id?.trim()) return apiError(400, "Worker id is required.");
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const body = (await req.json().catch(() => null)) as {
      rateHistoryId?: unknown;
      rate_history_id?: unknown;
    } | null;
    const rateHistoryId =
      typeof (body?.rateHistoryId ?? body?.rate_history_id) === "string"
        ? String(body?.rateHistoryId ?? body?.rate_history_id).trim()
        : "";
    if (!rateHistoryId) return apiError(400, "Rate history id is required.");

    const summary = await applyWorkerRateToUnpaidLaborEntriesWithClient(
      supabase,
      id,
      rateHistoryId
    );
    return NextResponse.json({ ok: true, summary }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update unpaid labor entries.";
    return apiError(500, message);
  }
}
