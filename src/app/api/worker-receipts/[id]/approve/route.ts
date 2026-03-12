import { NextResponse } from "next/server";
import { approveWorkerReceipt } from "@/lib/worker-receipts-db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const receipt = await approveWorkerReceipt(id);
    return NextResponse.json({ receipt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to approve";
    return NextResponse.json({ message }, { status: 400 });
  }
}
