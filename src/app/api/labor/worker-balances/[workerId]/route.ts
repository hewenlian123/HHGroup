import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { fetchWorkerBalances } from "@/lib/worker-balances-list";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

type RouteParams = { params: Promise<{ workerId: string }> };

/**
 * DELETE: Remove a worker from Worker Balances only when balance is ~$0 and they have
 * no labor_entries and no worker_payments rows (matches list `deletable` flag).
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { workerId } = await params;
  const id = workerId?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, message: "Worker id is required." }, { status: 400 });
  }

  const c = getServerSupabaseAdmin();
  if (!c) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  try {
    const balances = await fetchWorkerBalances(c);
    const row = balances.find((b) => b.workerId === id);
    if (!row) {
      return NextResponse.json({ ok: false, message: "Worker not found." }, { status: 404 });
    }
    if (!row.deletable) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Only workers with $0.00 balance and no labor entries or payments can be deleted.",
        },
        { status: 409 }
      );
    }

    const { error: lwErr } = await c.from("labor_workers").delete().eq("id", id);
    if (lwErr) {
      return NextResponse.json(
        { ok: false, message: lwErr.message ?? "Failed to delete worker." },
        {
          status: 500,
        }
      );
    }

    const { error: wErr } = await c.from("workers").delete().eq("id", id);
    if (wErr) {
      return NextResponse.json(
        { ok: false, message: wErr.message ?? "Failed to delete worker." },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete worker.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
