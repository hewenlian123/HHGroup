import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { rejectWorkerReceipt } from "@/lib/worker-receipts-db";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;

  const server = getServerSupabaseAdmin();
  if (!server) {
    return NextResponse.json(
      { message: "Receipt rejection is temporarily unavailable." },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;
    let reason: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.reason === "string") reason = body.reason;
    } catch {
      // no body
    }
    const receipt = await rejectWorkerReceipt(id, reason, server);
    return NextResponse.json({ receipt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reject";
    return NextResponse.json({ message }, { status: 400 });
  }
}
