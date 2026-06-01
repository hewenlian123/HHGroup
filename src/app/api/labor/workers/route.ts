import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { insertWorker } from "@/lib/workers-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

/**
 * GET: List all workers — query with admin client directly so UI always sees same data as DELETE/clear-data.
 */
export async function GET(req: Request) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json({ message: SUPABASE_MISSING_SERVER_ENV_MESSAGE }, { status: 503 });
  }
  try {
    const { data: rows, error } = await admin
      .from("workers")
      .select("id, name, role, phone, half_day_rate, status, notes, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "Failed to load workers.");
    const workers = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name ?? "",
      role: r.role ?? null,
      phone: r.phone ?? null,
      half_day_rate: Number(r.half_day_rate) || 0,
      status: r.status ?? "active",
      notes: r.notes ?? null,
      created_at: r.created_at ?? "",
    }));
    return NextResponse.json(workers, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load workers.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/**
 * POST: Create a worker (uses admin client).
 */
export async function POST(req: Request) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json({ message: SUPABASE_MISSING_SERVER_ENV_MESSAGE }, { status: 503 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name as string)?.trim() ?? "";
    if (!name) return NextResponse.json({ message: "Name is required." }, { status: 400 });
    const dailyRate =
      Number(body.daily_rate ?? body.dailyRate ?? body.half_day_rate ?? body.halfDayRate ?? 0) || 0;
    const worker = await insertWorker(
      {
        name,
        phone: (body.phone as string)?.trim() || null,
        trade: ((body.role ?? body.trade) as string)?.trim() || null,
        daily_rate: dailyRate,
        default_ot_rate: Number(body.default_ot_rate ?? body.defaultOtRate ?? 0) || 0,
        notes: (body.notes as string)?.trim() || null,
        status: body.status === "inactive" || body.status === "Inactive" ? "Inactive" : "Active",
      },
      admin
    );
    return NextResponse.json({
      ...worker,
      role: worker.trade,
      half_day_rate: worker.daily_rate,
      halfDayRate: worker.daily_rate,
      dailyRate: worker.daily_rate,
      status: worker.status === "Inactive" ? "inactive" : "active",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create worker.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
