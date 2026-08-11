import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { approveWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const server = getServerSupabaseAdmin();
  if (!server) {
    return NextResponse.json(
      { message: "Receipt approval is temporarily unavailable." },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;
    const { receipt, reimbursementCreated } = await approveWorkerReceiptWithClient(server, id);
    return NextResponse.json({ receipt, reimbursementCreated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to approve";
    return NextResponse.json({ message }, { status: 400 });
  }
}
