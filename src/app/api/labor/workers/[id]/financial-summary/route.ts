import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET: Worker profile financial summary.
 * Total Labor = SUM(labor_entries.cost_amount) for this worker.
 * Total Reimbursements = SUM(worker_reimbursements.amount).
 * Total Worker Invoices = SUM(worker_invoices.amount).
 * Total Payments = SUM(worker_payments.amount).
 * Balance = Labor + Reimbursements + Invoices - Payments.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workerId } = await params;
  if (!workerId) {
    return NextResponse.json({ message: "Worker id required" }, { status: 400 });
  }
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }
  const c = supabase;

  type RawResult = { data: Record<string, unknown>[] | null; error: { message?: string } | null };
  async function query(table: string, cols: string): Promise<RawResult> {
    const { data, error } = await c.from(table).select(cols).eq("worker_id", workerId);
    return { data: (data ?? null) as Record<string, unknown>[] | null, error };
  }

  try {
    let laborRes: RawResult = await query("labor_entries", "cost_amount");
    if (laborRes.error && /column.*cost_amount|schema cache/i.test(laborRes.error.message ?? "")) {
      laborRes = await query("labor_entries", "amount");
    }
    const laborRows = (laborRes.data ?? []) as { cost_amount?: number | null; amount?: number | null }[];
    const totalLabor = laborRows.reduce(
      (s, r) => s + (Number(r.cost_amount ?? r.amount) || 0),
      0
    );

    const reimbRes = await query("worker_reimbursements", "amount");
    const reimbRows = (reimbRes.data ?? []) as { amount?: number | null }[];
    const totalReimbursements = reimbRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const invoicesRes = await query("worker_invoices", "amount");
    const invoiceRows = (invoicesRes.data ?? []) as { amount?: number | null }[];
    const totalWorkerInvoices = invoiceRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    let paymentsRes: RawResult = await query("worker_payments", "worker_id, amount");
    if (paymentsRes.error && /column.*amount|schema cache/i.test(paymentsRes.error.message ?? "")) {
      paymentsRes = await query("worker_payments", "worker_id, total_amount");
    }
    const paymentRows = (paymentsRes.data ?? []) as { amount?: number | null; total_amount?: number | null }[];
    const totalPayments = paymentRows.reduce(
      (s, r) => s + (Number(r.amount ?? r.total_amount) || 0),
      0
    );

    const balance = totalLabor + totalReimbursements + totalWorkerInvoices - totalPayments;

    return NextResponse.json({
      totalLabor,
      totalReimbursements,
      totalWorkerInvoices,
      totalPayments,
      balance,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load financial summary";
    return NextResponse.json({ message }, { status: 500 });
  }
}
