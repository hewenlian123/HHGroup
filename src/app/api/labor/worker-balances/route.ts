import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type WorkerBalanceRow = {
  workerId: string;
  workerName: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  balance: number;
};

/**
 * GET: Worker balances summary.
 * Labor Owed = SUM(labor_entries.cost_amount WHERE status != 'paid')
 * Reimbursements = SUM(worker_reimbursements.amount WHERE status != 'paid')
 * Payments = SUM(worker_payments.amount)
 * Balance = Labor Owed + Reimbursements - Payments
 * One row per worker.
 */
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }
  const c = supabase;

  try {
    const workersRes = await c.from("workers").select("id, name").order("name");
    const workers = (workersRes.data ?? []) as { id: string; name: string | null }[];

    let laborRows: { worker_id: string; cost_amount?: number | null; status?: string | null }[] = [];
    let laborRes = await c.from("labor_entries").select("worker_id, cost_amount, status");
    if (laborRes.error && /column.*status|schema cache/i.test(laborRes.error.message ?? "")) {
      const fallback = await c.from("labor_entries").select("worker_id, cost_amount");
      laborRows = ((fallback.data ?? []) as { worker_id: string; cost_amount?: number | null }[]).map((r) => ({ ...r, status: null }));
    } else {
      laborRows = (laborRes.data ?? []) as { worker_id: string; cost_amount?: number | null; status?: string | null }[];
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

    const laborOwedByWorker = new Map<string, number>();
    for (const r of laborRows) {
      const wid = r.worker_id;
      if (!wid) continue;
      const status = (r.status ?? "").toLowerCase();
      if (status === "paid") continue;
      const amt = Number(r.cost_amount) || 0;
      laborOwedByWorker.set(wid, (laborOwedByWorker.get(wid) ?? 0) + amt);
    }

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

    const balances: WorkerBalanceRow[] = workers.map((w) => {
      const laborOwed = laborOwedByWorker.get(w.id) ?? 0;
      const reimbursements = reimbByWorker.get(w.id) ?? 0;
      const payments = paymentsByWorker.get(w.id) ?? 0;
      const balance = laborOwed + reimbursements - payments;
      return {
        workerId: w.id,
        workerName: (w.name ?? "").trim() || "—",
        laborOwed,
        reimbursements,
        payments,
        balance,
      };
    });

    return NextResponse.json({ balances });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker balances";
    return NextResponse.json({ message }, { status: 500 });
  }
}
