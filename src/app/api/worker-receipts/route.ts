import { NextResponse } from "next/server";
import { getWorkerReceipts } from "@/lib/worker-receipts-db";

export async function GET() {
  try {
    const list = await getWorkerReceipts();
    return NextResponse.json({ receipts: list });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
