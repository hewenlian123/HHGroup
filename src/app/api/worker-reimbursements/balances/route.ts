import { NextResponse } from "next/server";
import { getWorkerReimbursementBalances } from "@/lib/worker-reimbursements-db";

export async function GET() {
  try {
    const balances = await getWorkerReimbursementBalances();
    return NextResponse.json({ balances });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
