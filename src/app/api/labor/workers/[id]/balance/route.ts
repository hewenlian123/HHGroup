import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type LaborEntryRow = {
  id: string;
  date: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  status: string;
};

type ReimbursementRow = {
  id: string;
  date: string;
  vendor: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  status: string;
};

type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
};

/**
 * GET: Worker balance detail — labor entries, reimbursements, payments, and summary.
 * Uses a per-request Supabase client with cache: "no-store" so Next.js data cache
 * never serves a stale response between balance checks within the same workflow test.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workerId } = await params;
  if (!workerId) {
    return NextResponse.json({ message: "Worker id required" }, { status: 400 });
  }
  const c = getServerSupabaseAdmin();
  if (!c) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }

  // Shared result shape — avoids TypeScript inferring per-column types from each .select() call.
  type RawResult = { data: Record<string, unknown>[] | null; error: { message?: string } | null };

  function isMissingColumn(err: { message?: string } | null): boolean {
    return /column .* does not exist|could not find the .* column|schema cache/i.test(
      err?.message ?? ""
    );
  }

  /**
   * Run a query scoped to this worker and return a plain RawResult.
   * Using a wrapper function forces TypeScript to use the explicit return type
   * instead of inferring a per-column response type from .select().
   */
  async function queryWorker(
    table: string,
    cols: string,
    orderCol?: string
  ): Promise<RawResult> {
    const base = c.from(table).select(cols).eq("worker_id", workerId);
    const q = orderCol ? base.order(orderCol, { ascending: false }) : base;
    const { data, error } = await q;
    return {
      data: (data ?? null) as Record<string, unknown>[] | null,
      error: error as { message?: string } | null,
    };
  }

  try {
    const workerRes = await c
      .from("workers")
      .select("id, name")
      .eq("id", workerId)
      .maybeSingle();

    // labor_entries — progressively strip missing columns
    let laborRes: RawResult = { data: null, error: null };
    for (const cols of [
      "id, worker_id, project_id, work_date, cost_amount, status",
      "id, worker_id, project_id, work_date, cost_amount",
      "id, worker_id, project_id, work_date",
    ]) {
      laborRes = await queryWorker("labor_entries", cols, "work_date");
      if (!laborRes.error || !isMissingColumn(laborRes.error)) break;
    }

    // worker_payments — progressively strip missing columns, then drop ordering
    let paymentsRes: RawResult = { data: null, error: null };
    for (const cols of [
      "id, worker_id, payment_date, amount, payment_method, notes",
      "id, worker_id, payment_date, amount, notes",
      "id, worker_id, payment_date, amount",
    ]) {
      paymentsRes = await queryWorker("worker_payments", cols, "payment_date");
      if (!paymentsRes.error || !isMissingColumn(paymentsRes.error)) break;
    }
    if (paymentsRes.error) {
      paymentsRes = await queryWorker("worker_payments", "id, worker_id, amount");
    }
    if (paymentsRes.error) {
      paymentsRes = await queryWorker("worker_payments", "id, amount");
    }

    const [reimbRes, projectsRes] = await Promise.all([
      c
        .from("worker_reimbursements")
        .select("id, worker_id, project_id, vendor, amount, status, created_at")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false }),
      c.from("projects").select("id, name"),
    ]);

    const worker = workerRes.data as { id: string; name: string | null } | null;
    if (!worker?.id) {
      return NextResponse.json({ message: "Worker not found" }, { status: 404 });
    }

    const projectRows = (projectsRes.data ?? []) as { id: string; name: string | null }[];
    const projectNameById = new Map(projectRows.map((p) => [p.id, p.name ?? null]));

    const laborRaw = (laborRes.data ?? []) as {
      id: string;
      project_id: string | null;
      work_date?: string;
      cost_amount?: number | null;
      status?: string | null;
    }[];
    const laborEntries: LaborEntryRow[] = laborRaw.map((r) => ({
      id: r.id,
      date: (r.work_date ?? "").slice(0, 10),
      projectId: r.project_id ?? null,
      projectName: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
      amount: Number(r.cost_amount) || 0,
      status: String(r.status ?? "") || "—",
    }));

    const reimbRaw = (reimbRes.data ?? []) as {
      id: string;
      project_id: string | null;
      vendor: string | null;
      amount?: number | null;
      status?: string | null;
      created_at?: string;
    }[];
    const reimbursements: ReimbursementRow[] = reimbRaw.map((r) => ({
      id: r.id,
      date: (r.created_at ?? "").slice(0, 10),
      vendor: r.vendor ?? null,
      projectId: r.project_id ?? null,
      projectName: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
      amount: Number(r.amount) || 0,
      status: String(r.status ?? "") || "pending",
    }));

    const payRaw = (paymentsRes.data ?? []) as {
      id: string;
      payment_date?: string;
      amount?: number | null;
      payment_method?: string | null;
      notes?: string | null;
    }[];
    const payments: PaymentRow[] = payRaw.map((r) => ({
      id: r.id,
      date: (r.payment_date ?? "").slice(0, 10),
      amount: Number(r.amount) || 0,
      paymentMethod: r.payment_method ?? null,
      notes: r.notes ?? null,
    }));

    const laborOwed = laborRaw
      .filter((r) => String(r.status ?? "").toLowerCase() !== "paid")
      .reduce((s, r) => s + (Number(r.cost_amount) || 0), 0);
    const reimbUnpaid = reimbRaw
      .filter((r) => String(r.status ?? "").toLowerCase() !== "paid")
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalPayments = payRaw.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const balance = laborOwed + reimbUnpaid - totalPayments;

    return NextResponse.json({
      worker: { id: worker.id, name: worker.name ?? "—" },
      summary: { laborOwed, reimbursements: reimbUnpaid, payments: totalPayments, balance },
      laborEntries,
      reimbursements,
      payments,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker balance";
    return NextResponse.json({ message }, { status: 500 });
  }
}
