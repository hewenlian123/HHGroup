import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  changeWorkerDailyRateWithClient,
  getWorkerCurrentDailyRateWithClient,
  getWorkerRateHistoryWithClient,
} from "@/lib/worker-rate-history-db";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

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

function safeDate(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

export async function GET(req: Request, { params }: RouteParams) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id?.trim()) return apiError(400, "Worker id is required.");
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  try {
    const [history, current] = await Promise.all([
      getWorkerRateHistoryWithClient(supabase, id),
      getWorkerCurrentDailyRateWithClient(supabase, id),
    ]);
    return NextResponse.json({ ok: true, history, current }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load daily rate history.";
    return apiError(500, message);
  }
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
      dailyRate?: unknown;
      daily_rate?: unknown;
      effectiveFrom?: unknown;
      effective_from?: unknown;
      notes?: unknown;
    } | null;
    if (!body) return apiError(400, "Invalid JSON body.");
    const effectiveFrom = safeDate(body.effectiveFrom ?? body.effective_from);
    if (!effectiveFrom) return apiError(400, "Effective date is required.");
    const history = await changeWorkerDailyRateWithClient(supabase, id, {
      dailyRate: body.dailyRate ?? body.daily_rate,
      effectiveFrom,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ ok: true, history }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to change daily rate.";
    return apiError(500, message);
  }
}
