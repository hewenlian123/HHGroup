import { NextResponse } from "next/server";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";
import type { WorkerReimbursement } from "@/lib/worker-reimbursements-db";

/** Force fresh list so status updates appear immediately */
export const dynamic = "force-dynamic";

const COLS =
  "id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at, payment_id";

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
  const supabase = getServerSupabaseAdmin() ?? getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  try {
    // Some schemas use vendor_name instead of vendor, and some don't have payment_id.
    // Use a tolerant SELECT first; fall back to minimal columns if needed.
    let raw: Record<string, unknown>[] = [];
    const resFull = await supabase
      .from("worker_reimbursements")
      .select(COLS)
      .order("created_at", { ascending: false });
    if (resFull.error) {
      const resFallback = await supabase
        .from("worker_reimbursements")
        .select(
          "id, worker_id, project_id, amount, description, receipt_url, status, created_at, paid_at"
        )
        .order("created_at", { ascending: false });
      if (resFallback.error)
        throw new Error(resFallback.error.message ?? "Failed to load reimbursements.");
      raw = (resFallback.data ?? []) as Record<string, unknown>[];
    } else {
      raw = (resFull.data ?? []) as Record<string, unknown>[];
    }

    const all = raw.map((r) => {
      if (r.vendor == null && (r as any).vendor_name != null)
        (r as any).vendor = (r as any).vendor_name;
      return fromRow(r);
    });
    const list = all.filter((r) => r.status === "pending");

    const workerIds = Array.from(new Set(list.map((r) => r.workerId).filter(Boolean))) as string[];
    const projectIds = Array.from(
      new Set(list.map((r) => r.projectId).filter(Boolean))
    ) as string[];
    const [workersRes, projectsRes] = await Promise.all([
      workerIds.length
        ? supabase.from("workers").select("id, name").in("id", workerIds)
        : { data: [] },
      projectIds.length
        ? supabase.from("projects").select("id, name").in("id", projectIds)
        : { data: [] },
    ]);
    const workerNameById = new Map(
      ((workersRes.data ?? []) as { id: string; name: string | null }[]).map((w) => [
        w.id,
        w.name ?? null,
      ])
    );
    const projectNameById = new Map(
      ((projectsRes.data ?? []) as { id: string; name: string | null }[]).map((p) => [
        p.id,
        p.name ?? null,
      ])
    );

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

/**
 * POST: Create a worker reimbursement using admin client (bypass RLS),
 * so create + list are consistent.
 *
 * Accepts: { workerId, projectId?, vendor?, amount, description?, receiptUrl?, status? }
 * Handles vendor column name differences (vendor vs vendor_name).
 */
export async function POST(req: Request) {
  const supabase = getServerSupabaseAdmin() ?? getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });

    const workerId = typeof body.workerId === "string" ? body.workerId.trim() : "";
    if (!workerId) return NextResponse.json({ message: "workerId is required." }, { status: 400 });
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0)
      return NextResponse.json({ message: "amount is invalid." }, { status: 400 });

    const payloadBase: Record<string, unknown> = {
      worker_id: workerId,
      project_id: projectId || null,
      amount,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      receipt_url: typeof body.receiptUrl === "string" ? body.receiptUrl.trim() || null : null,
      status: typeof body.status === "string" ? body.status : "pending",
    };

    // Try vendor column first.
    let res = await supabase
      .from("worker_reimbursements")
      .insert({ ...payloadBase, vendor: vendor || null })
      .select(COLS)
      .single();
    if (
      res.error &&
      /column .*vendor.*does not exist|schema cache/i.test(res.error.message ?? "")
    ) {
      // Fallback: vendor_name column
      res = await supabase
        .from("worker_reimbursements")
        .insert({ ...payloadBase, vendor_name: vendor || null })
        // Select * so this works even if COLS doesn't match schema exactly (e.g. vendor_name vs vendor).
        .select("*")
        .single();
    }
    if (res.error || !res.data) {
      return NextResponse.json(
        { message: res.error?.message ?? "Failed to create reimbursement." },
        { status: 500 }
      );
    }
    const row = res.data as Record<string, unknown>;
    // Map vendor_name -> vendor for client shape compatibility
    if (row.vendor == null && row.vendor_name != null) row.vendor = row.vendor_name;
    return NextResponse.json({ reimbursement: fromRow(row) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create reimbursement.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
