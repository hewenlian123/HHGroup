import { NextResponse } from "next/server";
import {
  deleteWorkerReceipt,
  deleteWorkerReceiptWithClient,
} from "@/lib/worker-receipts-db";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Prefer admin client so delete bypasses RLS and reliably removes the row
    const admin = getServerSupabaseAdmin();
    const server = admin ?? getServerSupabase();
    if (server) {
      await deleteWorkerReceiptWithClient(server, id);
    } else {
      await deleteWorkerReceipt(id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete receipt";
    return NextResponse.json({ message }, { status: 400 });
  }
}

