import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { fetchWorkerBalances, type WorkerBalanceRow } from "@/lib/worker-balances-list";
import { attachServerTiming } from "@/lib/performance/server-timing";

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
export async function GET(request: Request) {
  const handlerStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  const authDuration = performance.now() - authStartedAt;
  let serverDataDuration = 0;
  const finish = <T extends Response>(response: T) =>
    attachServerTiming(response, {
      hh_auth: authDuration,
      hh_server_data: serverDataDuration,
      hh_handler_total: performance.now() - handlerStartedAt,
    });
  if (!guard.ok) return finish(guard.response);

  const c = guard.client;
  if (!c) {
    return finish(
      NextResponse.json(
        { message: "Authenticated Supabase session is not configured." },
        { status: 503, headers: NO_CACHE_HEADERS }
      )
    );
  }

  const serverDataStartedAt = performance.now();
  try {
    const balances = await fetchWorkerBalances(c);
    serverDataDuration = performance.now() - serverDataStartedAt;
    return finish(NextResponse.json({ balances }, { headers: NO_CACHE_HEADERS }));
  } catch (e) {
    serverDataDuration = performance.now() - serverDataStartedAt;
    const message = e instanceof Error ? e.message : "Failed to load worker balances";
    return finish(NextResponse.json({ message }, { status: 500, headers: NO_CACHE_HEADERS }));
  }
}
