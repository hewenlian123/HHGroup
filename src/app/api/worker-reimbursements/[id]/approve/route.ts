import { NextResponse } from "next/server";

/** Approve endpoint deprecated: approval belongs to Worker Inbox; payment is a separate action. */
export async function POST() {
  return NextResponse.json(
    {
      message:
        "Review and approve the Worker Receipt in Worker Inbox, then Continue to Payment in Labor Reimbursements.",
    },
    { status: 410 }
  );
}
