import { NextResponse } from "next/server";
import { getWorkerReimbursementsByWorkerId } from "@/lib/worker-reimbursements-db";

export async function GET(_req: Request, { params }: { params: Promise<{ workerId: string }> }) {
  try {
    const { workerId } = await params;
    const reimbursements = await getWorkerReimbursementsByWorkerId(workerId);
    return NextResponse.json({ reimbursements });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
