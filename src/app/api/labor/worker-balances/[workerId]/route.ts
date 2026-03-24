import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { fetchWorkerBalanceRowForDelete } from "@/lib/worker-balances-list";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

type RouteParams = { params: Promise<{ workerId: string }> };

function paySelectErrorMissingCol(err: { message?: string } | null): boolean {
  return /column .* does not exist|could not find the .* column|schema cache/i.test(
    err?.message ?? ""
  );
}

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

  const BAL_EPS = 0.005;

  try {
    let row = await fetchWorkerBalanceRowForDelete(c, id);
    if (!row) {
      const { data: lw } = await c
        .from("labor_workers")
        .select("id, name")
        .eq("id", id)
        .maybeSingle();
      if (!lw?.id) {
        return NextResponse.json({ ok: false, message: "Worker not found." }, { status: 404 });
      }
      // Fallback: compute deletable from worker-specific aggregates directly.
      // This avoids false "not found" when list aggregation diverges from delete-time lookup.
      const workerId = String(lw.id);

      type PayRow = { id?: string; total_amount?: number | null; amount?: number | null };
      let payRows: PayRow[] = [];
      const payPrimary = await c
        .from("worker_payments")
        .select("id, total_amount")
        .eq("worker_id", workerId);
      if (!payPrimary.error) {
        payRows = (payPrimary.data ?? []) as PayRow[];
      } else if (paySelectErrorMissingCol(payPrimary.error)) {
        const payFb = await c.from("worker_payments").select("id, amount").eq("worker_id", workerId);
        if (!payFb.error) payRows = (payFb.data ?? []) as PayRow[];
      }

      const [laborRes, reimbRes, advRes] = await Promise.all([
        c
          .from("labor_entries")
          .select("worker_payment_id, cost_amount, total")
          .eq("worker_id", workerId),
        c.from("worker_reimbursements").select("amount, status").eq("worker_id", workerId),
        c.from("worker_advances").select("amount, status").eq("worker_id", workerId),
      ]);

      const laborRows = (laborRes.data ?? []) as Array<{
        worker_payment_id?: string | null;
        cost_amount?: number | null;
        total?: number | null;
      }>;
      const reimbRows = (reimbRes.data ?? []) as Array<{
        amount?: number | null;
        status?: string | null;
      }>;
      const advRows = (advRes.data ?? []) as Array<{
        amount?: number | null;
        status?: string | null;
      }>;

      const laborOwed = laborRows.reduce((s, r) => {
        const linked = String(r.worker_payment_id ?? "").trim().length > 0;
        if (linked) return s;
        return s + (Number(r.cost_amount ?? r.total) || 0);
      }, 0);
      const reimbursements = reimbRows.reduce((s, r) => {
        if (String(r.status ?? "").toLowerCase() === "paid") return s;
        return s + (Number(r.amount) || 0);
      }, 0);
      const payments = payRows.reduce((s, r) => s + (Number(r.total_amount ?? r.amount) || 0), 0);
      const advances = advRows.reduce((s, r) => {
        const st = String(r.status ?? "").toLowerCase();
        if (st !== "deducted") return s;
        return s + (Number(r.amount) || 0);
      }, 0);
      const balance = laborOwed + reimbursements - payments - advances;
      const deletable =
        laborRows.length === 0 &&
        payRows.length === 0 &&
        Math.abs(laborOwed) < BAL_EPS &&
        Math.abs(reimbursements) < BAL_EPS &&
        Math.abs(payments) < BAL_EPS &&
        Math.abs(advances) < BAL_EPS &&
        Math.abs(balance) < BAL_EPS;

      row = {
        workerId,
        workerName: String(lw.name ?? "").trim() || "—",
        laborOwed,
        reimbursements,
        payments,
        advances,
        balance,
        deletable,
      };
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
