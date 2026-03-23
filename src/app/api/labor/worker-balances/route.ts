import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { fetchWorkerBalances, type WorkerBalanceRow } from "@/lib/worker-balances-list";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export type { WorkerBalanceRow };

/**
 * GET: Worker balances summary (see `fetchWorkerBalances` in `@/lib/worker-balances-list`).
 */
export async function GET() {
  const c = getServerSupabaseAdmin();
  if (!c) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  try {
    const balances = await fetchWorkerBalances(c);
    // Safety filter: only return rows that still exist in labor_workers now.
    // This prevents stale/ghost rows if aggregate helpers diverge in edge cases.
    const { data: workersNow } = await c.from("labor_workers").select("id");
    const ids = new Set(((workersNow ?? []) as Array<{ id?: string | null }>).map((w) => w.id).filter(Boolean));
    const filtered = balances.filter((b) => ids.has(b.workerId));
    return NextResponse.json({ balances: filtered }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker balances";
    return NextResponse.json({ message }, { status: 500 });
  }
}
