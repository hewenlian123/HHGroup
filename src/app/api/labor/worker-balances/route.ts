import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { fetchWorkerBalances, type WorkerBalanceRow } from "@/lib/worker-balances-list";

/** Opt out of any Route Handler / Data Cache (Next + Vercel Edge). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Strong no-cache for browsers and CDNs (incl. Vercel).
 * @see https://vercel.com/docs/headers/response-headers#cdn-cache-control
 */
const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export type { WorkerBalanceRow };

/**
 * GET: Worker balances summary (see `fetchWorkerBalances` in `@/lib/worker-balances-list`).
 */
export async function GET() {
  const c = getServerSupabaseAdmin();
  if (!c) {
    return NextResponse.json(
      { message: "Supabase not configured" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const balances = await fetchWorkerBalances(c);
    return NextResponse.json({ balances }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker balances";
    return NextResponse.json({ message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
