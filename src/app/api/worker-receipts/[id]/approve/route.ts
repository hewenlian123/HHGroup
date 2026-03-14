import { NextResponse } from "next/server";
import { approveWorkerReceipt, approveWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
import { getServerSupabase } from "@/lib/supabase-server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const server = getServerSupabase();
    const { receipt, reimbursementCreated } = server
      ? await approveWorkerReceiptWithClient(server, id)
      : await approveWorkerReceipt(id);
    return NextResponse.json({ receipt, reimbursementCreated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to approve";
    return NextResponse.json({ message }, { status: 400 });
  }
}
