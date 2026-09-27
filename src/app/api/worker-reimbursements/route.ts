import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { getWorkerReimbursements } from "@/lib/worker-reimbursements-db";

/** Force fresh list so status updates appear immediately */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseAdmin);
  if (!guard.ok) return guard.response;

  const supabase = guard.client ?? getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  try {
    const reimbursements = await getWorkerReimbursements(supabase);
    return NextResponse.json({ reimbursements });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** Legacy manual creation is retired; obligations originate in reviewed worker receipts. */
export async function POST(req: Request) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseAdmin);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    {
      message:
        "Submit a Worker Receipt and approve it in Worker Inbox. Manual reimbursement creation is retired.",
    },
    { status: 410 }
  );
}
