import { NextResponse } from "next/server";
import { getWorkerReceipts } from "@/lib/worker-receipts-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  try {
    const list = await getWorkerReceipts();
    return NextResponse.json({ receipts: list }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
