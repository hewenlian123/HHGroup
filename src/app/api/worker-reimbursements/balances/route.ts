import { NextResponse } from "next/server";
import { getWorkerReimbursementBalances } from "@/lib/worker-reimbursements-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  try {
    const balances = await getWorkerReimbursementBalances();
    return NextResponse.json({ balances }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
