import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { getWorkerReimbursementsByWorkerId } from "@/lib/worker-reimbursements-db";

export async function GET(req: Request, { params }: { params: Promise<{ workerId: string }> }) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }

  try {
    const { workerId } = await params;
    const reimbursements = await getWorkerReimbursementsByWorkerId(workerId, supabase);
    return NextResponse.json({ reimbursements });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
