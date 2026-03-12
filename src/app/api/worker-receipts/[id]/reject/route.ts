import { NextResponse } from "next/server";
import { rejectWorkerReceipt } from "@/lib/worker-receipts-db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let reason: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.reason === "string") reason = body.reason;
    } catch {
      // no body
    }
    const receipt = await rejectWorkerReceipt(id, reason);
    return NextResponse.json({ receipt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reject";
    return NextResponse.json({ message }, { status: 400 });
  }
}
