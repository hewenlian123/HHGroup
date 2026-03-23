import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { fetchWorkerBalanceRowForDelete } from "@/lib/worker-balances-list";

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
  let id = workerId?.trim() ?? "";
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  id = id.trim();
  if (!id) {
    return NextResponse.json({ ok: false, message: "Worker id is required." }, { status: 400 });
  }

  const c = getServerSupabaseAdmin();
  if (!c) {
    return NextResponse.json({ ok: false, message: "Supabase not configured." }, { status: 500 });
  }

  try {
    let row = await fetchWorkerBalanceRowForDelete(c, id);
    if (!row) {
      const { data: lw } = await c.from("labor_workers").select("id, name").eq("id", id).maybeSingle();
      if (!lw?.id) {
        return NextResponse.json({ ok: false, message: "Worker not found." }, { status: 404 });
      }
      row = await fetchWorkerBalanceRowForDelete(c, String(lw.id));
    }
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

    const deleteId = row.workerId;

    const { error: lwErr } = await c.from("labor_workers").delete().eq("id", deleteId);
    if (lwErr) {
      return NextResponse.json(
        { ok: false, message: lwErr.message ?? "Failed to delete worker." },
        {
          status: 500,
        }
      );
    }

    const { error: wErr } = await c.from("workers").delete().eq("id", deleteId);
    if (wErr) {
      return NextResponse.json(
        {
          ok: true,
          warning:
            "Removed from Worker Balances. The People (workers) row may still exist if referenced elsewhere.",
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete worker.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
