import { NextResponse } from "next/server";

/** Approve endpoint deprecated: workflow uses only pending → paid. Use Mark as Paid instead. */
export async function POST() {
  return NextResponse.json(
    { message: "Reimbursement workflow simplified. Use Mark as Paid for pending items." },
    { status: 410 }
  );
}
