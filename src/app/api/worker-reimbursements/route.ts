import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import type { WorkerReimbursement } from "@/lib/worker-reimbursements-db";

/** Force fresh list so status updates appear immediately */
export const dynamic = "force-dynamic";

const COLS = "id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at, payment_id";

function fromRow(r: Record<string, unknown>): WorkerReimbursement {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    workerName: null,
    projectId: (r.project_id as string | null) ?? null,
    projectName: null,
    vendor: (r.vendor as string | null) ?? null,
    amount: Number(r.amount) || 0,
    description: (r.description as string | null) ?? null,
    receiptUrl: (r.receipt_url as string | null) ?? null,
    status: String(r.status ?? "").toLowerCase() === "paid" ? "paid" : "pending",
    createdAt: String(r.created_at ?? ""),
    paidAt: r.paid_at != null ? String(r.paid_at) : null,
    paymentId: (r.payment_id as string | null) ?? null,
  };
}

/**
 * GET: List worker reimbursements using the same admin client as DELETE, so list and delete see the same data.
 */
export async function GET() {
  const supabase = getServerSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  try {
    const { data: raw, error } = await supabase
      .from("worker_reimbursements")
      .select(COLS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "Failed to load reimbursements.");
    const all = ((raw ?? []) as Record<string, unknown>[]).map(fromRow);
    const list = all.filter((r) => r.status === "pending");

    const workerIds = Array.from(new Set(list.map((r) => r.workerId).filter(Boolean))) as string[];
    const projectIds = Array.from(new Set(list.map((r) => r.projectId).filter(Boolean))) as string[];
    const [workersRes, projectsRes] = await Promise.all([
      workerIds.length ? supabase.from("workers").select("id, name").in("id", workerIds) : { data: [] },
      projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : { data: [] },
    ]);
    const workerNameById = new Map(((workersRes.data ?? []) as { id: string; name: string | null }[]).map((w) => [w.id, w.name ?? null]));
    const projectNameById = new Map(((projectsRes.data ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? null]));

    const enriched: WorkerReimbursement[] = list.map((r) => ({
      ...r,
      workerName: workerNameById.get(r.workerId) ?? null,
      projectName: r.projectId ? (projectNameById.get(r.projectId) ?? null) : null,
    }));

    const sorted = [...enriched].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({ reimbursements: sorted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
