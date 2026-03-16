import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import postgres from "postgres";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export type WorkerBalanceRow = {
  workerId: string;
  workerName: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  advances: number;
  balance: number;
};

/**
 * GET: Worker balances summary.
 * Labor Owed = SUM(labor_entries.cost_amount WHERE status != 'paid')
 * Reimbursements = SUM(worker_reimbursements.amount WHERE status != 'paid')
 * Payments = SUM(worker_payments.amount)
   * Advances = SUM(worker_advances.amount WHERE status IN ('pending','deducted'))
   * Balance = Labor Owed + Reimbursements - Payments - Advances
 * One row per worker.
 */
export async function GET() {
  const c = getServerSupabaseAdmin();
  if (!c) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  try {
    // Use labor_workers for display name and to match labor_entries.worker_id FK.
    const workersRes = await c.from("labor_workers").select("id, name").order("name");
    const workers = (workersRes.data ?? []) as { id: string; name: string | null }[];

    // Prefer a single SQL aggregation when SUPABASE_DATABASE_URL is available:
    // SELECT lw.id, lw.name, SUM(le.cost_amount) FROM labor_workers lw
    // LEFT JOIN labor_entries le ON le.worker_id = lw.id AND status != 'paid'
    // GROUP BY lw.id, lw.name
    const laborOwedByWorker = new Map<string, number>();
    const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (dbUrl) {
      const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
      try {
        const rows = await sql<{
          worker_id: string;
          name: string | null;
          labor_owed: string | number | null;
        }[]>`
          select
            lw.id as worker_id,
            lw.name,
            coalesce(sum(le.cost_amount), 0) as labor_owed
          from labor_workers lw
          left join labor_entries le
            on le.worker_id = lw.id
           and coalesce(lower(le.status), '') <> 'paid'
          group by lw.id, lw.name
        `;
        for (const r of rows) {
          const wid = r.worker_id;
          if (!wid) continue;
          const amt = Number(r.labor_owed) || 0;
          laborOwedByWorker.set(wid, amt);
        }
      } finally {
        await sql.end();
      }
    } else {
      // Fallback to Supabase aggregation when direct DB access is not configured
      let laborRows: { worker_id: string; cost_amount?: number | null; status?: string | null }[] = [];
      let laborRes = await c.from("labor_entries").select("worker_id, cost_amount, status");
      if (laborRes.error && /column.*status|schema cache/i.test(laborRes.error.message ?? "")) {
        const fallback = await c.from("labor_entries").select("worker_id, cost_amount");
        laborRows = ((fallback.data ?? []) as { worker_id: string; cost_amount?: number | null }[]).map((r) => ({
          ...r,
          status: null,
        }));
      } else {
        laborRows = (laborRes.data ?? []) as {
          worker_id: string;
          cost_amount?: number | null;
          status?: string | null;
        }[];
      }

      for (const r of laborRows) {
        const wid = r.worker_id;
        if (!wid) continue;
        const status = (r.status ?? "").toLowerCase();
        if (status === "paid") continue;
        const amt = Number(r.cost_amount) || 0;
        laborOwedByWorker.set(wid, (laborOwedByWorker.get(wid) ?? 0) + amt);
      }
    }

    const reimbRes = await c.from("worker_reimbursements").select("worker_id, amount, status");
    let paymentRows: { worker_id: string; amount?: number | null }[] = [];
    const paymentsRes = await c.from("worker_payments").select("worker_id, amount");
    if (paymentsRes.error && /column.*amount|schema cache/i.test(paymentsRes.error.message ?? "")) {
      const payFallback = await c.from("worker_payments").select("worker_id, total_amount");
      paymentRows = ((payFallback.data ?? []) as { worker_id: string; total_amount?: number | null }[]).map((r) => ({
        worker_id: r.worker_id,
        amount: r.total_amount ?? null,
      }));
    } else {
      paymentRows = (paymentsRes.data ?? []) as { worker_id: string; amount?: number | null }[];
    }

    const reimbRows = (reimbRes.data ?? []) as { worker_id: string; amount?: number | null; status?: string | null }[];

    const reimbByWorker = new Map<string, number>();
    for (const r of reimbRows) {
      const wid = r.worker_id;
      if (!wid) continue;
      const status = (r.status ?? "").toLowerCase();
      if (status === "paid") continue;
      const amt = Number(r.amount) || 0;
      reimbByWorker.set(wid, (reimbByWorker.get(wid) ?? 0) + amt);
    }

    const paymentsByWorker = new Map<string, number>();
    for (const r of paymentRows) {
      const wid = r.worker_id;
      if (!wid) continue;
      const amt = Number(r.amount) || 0;
      paymentsByWorker.set(wid, (paymentsByWorker.get(wid) ?? 0) + amt);
    }

    const advancesRes = await c
      .from("worker_advances")
      .select("worker_id, amount, status");
    const advancesRows = (advancesRes.data ?? []) as {
      worker_id: string;
      amount?: number | null;
      status?: string | null;
    }[];

    const advancesByWorker = new Map<string, number>();
    for (const r of advancesRows) {
      const wid = r.worker_id;
      if (!wid) continue;
      const status = (r.status ?? "").toLowerCase();
      if (status !== "pending" && status !== "deducted") continue;
      const amt = Number(r.amount) || 0;
      advancesByWorker.set(wid, (advancesByWorker.get(wid) ?? 0) + amt);
    }

    const balances: WorkerBalanceRow[] = workers.map((w) => {
      const laborOwed = laborOwedByWorker.get(w.id) ?? 0;
      const reimbursements = reimbByWorker.get(w.id) ?? 0;
      const payments = paymentsByWorker.get(w.id) ?? 0;
      const advances = advancesByWorker.get(w.id) ?? 0;
      const balance = laborOwed + reimbursements - payments - advances;
      return {
        workerId: w.id,
        workerName: (w.name ?? "").trim() || "—",
        laborOwed,
        reimbursements,
        payments,
        advances,
        balance,
      };
    });

    return NextResponse.json({ balances }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker balances";
    return NextResponse.json({ message }, { status: 500 });
  }
}
