import { NextResponse } from "next/server";
import { approveWorkerReceipt, approveWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Prefer service role so approve (insert worker_reimbursements + update worker_receipts) is not blocked by RLS
    const server = getServerSupabaseAdmin() ?? getServerSupabase();
    const { receipt, reimbursementCreated } = server
      ? await approveWorkerReceiptWithClient(server, id)
      : await approveWorkerReceipt(id);
    return NextResponse.json({ receipt, reimbursementCreated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to approve";
    return NextResponse.json({ message }, { status: 400 });
  }
}
