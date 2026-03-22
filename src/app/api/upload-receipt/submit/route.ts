import { NextResponse } from "next/server";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { insertWorkerReceiptWithClient } from "@/lib/worker-receipts-db";

/**
 * Save receipt metadata + receipt_url to worker_receipts. Uses server Supabase client
 * so insert runs with server env (no auth required).
 */
export async function POST(req: Request) {
  try {
    // Prefer service role client so inserts are not blocked by RLS in production.
    const supabase = getServerSupabaseAdmin() ?? getServerSupabase();
    if (!supabase) {
      return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
    }
    const body = await req.json();
    const workerId = typeof body.workerId === "string" ? body.workerId : null;
    const workerName = typeof body.workerName === "string" ? body.workerName.trim() : "";
    const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
    const expenseType = typeof body.expenseType === "string" ? body.expenseType : "Other";
    const vendor = typeof body.vendor === "string" ? body.vendor.trim() : null;
    const amount = Number(body.amount);
    const receiptUrl = typeof body.receiptUrl === "string" ? body.receiptUrl.trim() : null;
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const receiptDateRaw = typeof body.receiptDate === "string" ? body.receiptDate.trim() : "";
    const today = new Date();
    const todayIso = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
      .toISOString()
      .slice(0, 10);
    const receiptDate =
      receiptDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(receiptDateRaw) ? receiptDateRaw : todayIso;

    if (!workerName && !workerId) {
      return NextResponse.json({ message: "Worker is required." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ message: "Valid amount is required." }, { status: 400 });
    }
    if (!receiptUrl) {
      return NextResponse.json({ message: "Receipt photo is required." }, { status: 400 });
    }

    try {
      const receipt = await insertWorkerReceiptWithClient(supabase, {
        workerId,
        workerName: workerName || "Unknown",
        projectId,
        expenseType,
        vendor: vendor || null,
        amount,
        receiptUrl,
        description: description || null,
        notes: notes || null,
        receiptDate,
        status: "Pending",
      });
      return NextResponse.json({ ok: true, id: receipt.id, receipt_url: receipt.receiptUrl });
    } catch (err) {
      // Log detailed error for debugging in Vercel function logs.
      // eslint-disable-next-line no-console
      console.error("[upload-receipt/submit] insert failed", {
        error: err instanceof Error ? err.message : String(err),
        workerId,
        projectId,
        amount,
        expenseType,
      });
      throw err;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Submit failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
