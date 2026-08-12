import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { getWorkerReimbursementBalances } from "@/lib/worker-reimbursements-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseInternalNoStore);
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }

  try {
    const balances = await getWorkerReimbursementBalances(supabase);
    return NextResponse.json({ balances }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
