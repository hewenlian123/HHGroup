import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { deleteWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const server = getServerSupabaseAdmin();
  if (!server) {
    return NextResponse.json(
      { message: "Receipt deletion is temporarily unavailable." },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;
    await deleteWorkerReceiptWithClient(server, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete receipt";
    return NextResponse.json({ message }, { status: 400 });
  }
}
