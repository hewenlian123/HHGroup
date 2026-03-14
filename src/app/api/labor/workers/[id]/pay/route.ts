import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { createWorkerPayment } from "@/lib/worker-payments-db";

export const dynamic = "force-dynamic";

/**
 * POST: Create worker payment and mark all unpaid labor_entries and worker_reimbursements for this worker as paid.
 * Body: { amount: number, payment_method: string, payment_date?: string (YYYY-MM-DD), notes?: string }
 * Does not modify existing reimbursement pay flow (no expense creation here).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workerId } = await params;
  if (!workerId) {
    return NextResponse.json({ message: "Worker id required" }, { status: 400 });
  }

  let body: { amount?: number; payment_method?: string; payment_date?: string; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const amount = Number(body.amount);
  const paymentMethod = typeof body.payment_method === "string" ? body.payment_method.trim() : "";
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "Valid amount is required" }, { status: 400 });
  }
  if (!paymentMethod) {
    return NextResponse.json({ message: "Payment method is required" }, { status: 400 });
  }

  const paymentDate = (body.payment_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  try {
    const payment = await createWorkerPayment({
      workerId,
      amount,
      paymentMethod,
      paymentDate,
      notes,
    });

    const server = getServerSupabase();
    if (server) {
      try {
        await server.from("labor_entries").update({ status: "paid" }).eq("worker_id", workerId).or("status.neq.paid,status.is.null");
      } catch {
        // labor_entries may not have status column; ignore
      }
      try {
        await server.from("worker_reimbursements").update({ status: "paid", paid_at: new Date().toISOString() }).eq("worker_id", workerId).neq("status", "paid");
      } catch (e) {
        if (!/column|schema cache/i.test((e as Error)?.message ?? "")) throw e;
      }
    }

    return NextResponse.json({ ok: true, payment });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create payment";
    return NextResponse.json({ message }, { status: 400 });
  }
}
