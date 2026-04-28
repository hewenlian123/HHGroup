import { NextResponse } from "next/server";
import { createWorker } from "@/lib/data";
import { getServerSupabaseInternal } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

/**
 * GET: List all workers — query with admin client directly so UI always sees same data as DELETE/clear-data.
 */
export async function GET() {
  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
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
  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name as string)?.trim() ?? "";
    if (!name) return NextResponse.json({ message: "Name is required." }, { status: 400 });
    const halfDayRate = Number(body.half_day_rate ?? body.halfDayRate ?? 0) || 0;
    const worker = await createWorker({
      name,
      phone: (body.phone as string)?.trim() || undefined,
      trade: ((body.role ?? body.trade) as string)?.trim() || undefined,
      halfDayRate,
      status: body.status === "inactive" ? "inactive" : "active",
    });
    return NextResponse.json(worker);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create worker.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
