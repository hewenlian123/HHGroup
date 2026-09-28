import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { resetWorkerReceiptToPending } from "@/lib/worker-receipts-db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;
  const server = getServerSupabaseAdmin();
  if (!server)
    return NextResponse.json(
      { message: "Receipt reset is temporarily unavailable." },
      { status: 503 }
    );
  try {
    const { id } = await params;
    const receipt = await resetWorkerReceiptToPending(id, server);
    return NextResponse.json({ receipt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reset";
    return NextResponse.json({ message }, { status: 400 });
  }
}
