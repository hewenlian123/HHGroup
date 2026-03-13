import { NextResponse } from "next/server";
import { deleteWorkerReceipt } from "@/lib/worker-receipts-db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteWorkerReceipt(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete receipt";
    return NextResponse.json({ message }, { status: 400 });
  }
}

