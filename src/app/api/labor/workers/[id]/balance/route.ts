import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 * Does not modify any existing APIs; read-only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workerId } = await params;
  if (!workerId) {
    return NextResponse.json({ message: "Worker id required" }, { status: 400 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 500 });
  }
  // Create a fresh client per-request with no-store fetch so Next.js data cache
  // does not serve stale Supabase responses between balance checks.
  const c = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input as RequestInfo, { ...init, cache: "no-store" }),
    },
  });

  function isMissingColumn(err: { message?: string } | null): boolean {
    return /column .* does not exist|could not find the .* column|schema cache/i.test(err?.message ?? "");
  }

  try {
    const workerRes = await c.from("workers").select("id, name").eq("id", workerId).maybeSingle();

    // labor_entries: try with status+cost_amount, then without status, then without cost_amount
    let laborRes = await c
      .from("labor_entries")
      .select("id, worker_id, project_id, work_date, cost_amount, status")
      .eq("worker_id", workerId)
      .order("work_date", { ascending: false });
    if (laborRes.error && isMissingColumn(laborRes.error)) {
      laborRes = await c
        .from("labor_entries")
        .select("id, worker_id, project_id, work_date, cost_amount")
        .eq("worker_id", workerId)
        .order("work_date", { ascending: false });
    }
    if (laborRes.error && isMissingColumn(laborRes.error)) {
      laborRes = await c
        .from("labor_entries")
        .select("id, worker_id, project_id, work_date")
        .eq("worker_id", workerId)
        .order("work_date", { ascending: false });
    }

    // worker_payments: progressively simpler selects; final fallbacks drop order clause entirely
    let paymentsRes = await c
      .from("worker_payments")
      .select("id, worker_id, payment_date, amount, payment_method, notes")
      .eq("worker_id", workerId)
      .order("payment_date", { ascending: false });
    if (paymentsRes.error && isMissingColumn(paymentsRes.error)) {
      paymentsRes = await c
        .from("worker_payments")
        .select("id, worker_id, payment_date, amount, notes")
        .eq("worker_id", workerId)
        .order("payment_date", { ascending: false });
    }
    if (paymentsRes.error && isMissingColumn(paymentsRes.error)) {
      paymentsRes = await c
        .from("worker_payments")
        .select("id, worker_id, payment_date, amount")
        .eq("worker_id", workerId)
        .order("payment_date", { ascending: false });
    }
    // If order("payment_date") itself causes an error, retry without it
    if (paymentsRes.error) {
      paymentsRes = await c
        .from("worker_payments")
        .select("id, worker_id, amount")
        .eq("worker_id", workerId);
    }
    if (paymentsRes.error) {
      paymentsRes = await c
        .from("worker_payments")
        .select("id, amount")
        .eq("worker_id", workerId);
    }

    const [reimbRes, projectsRes] = await Promise.all([
      c.from("worker_reimbursements").select("id, worker_id, project_id, vendor, amount, status, created_at").eq("worker_id", workerId).order("created_at", { ascending: false }),
      c.from("projects").select("id, name"),
    ]);

    const worker = workerRes.data as { id: string; name: string | null } | null;
    if (!worker?.id) {
      return NextResponse.json({ message: "Worker not found" }, { status: 404 });
    }

    const projectRows = (projectsRes.data ?? []) as { id: string; name: string | null }[];
    const projectNameById = new Map(projectRows.map((p) => [p.id, p.name ?? null]));

    const laborRaw = (laborRes.data ?? []) as { id: string; project_id: string | null; work_date?: string; cost_amount?: number | null; status?: string | null }[];
    const laborEntries: LaborEntryRow[] = laborRaw.map((r) => ({
      id: r.id,
      date: (r.work_date ?? "").slice(0, 10),
      projectId: r.project_id ?? null,
      projectName: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
      amount: Number(r.cost_amount) || 0,
      status: (r.status ?? "").toString() || "—",
    }));

    const reimbRaw = (reimbRes.data ?? []) as { id: string; project_id: string | null; vendor: string | null; amount?: number | null; status?: string | null; created_at?: string }[];
    const reimbursements: ReimbursementRow[] = reimbRaw.map((r) => ({
      id: r.id,
      date: (r.created_at ?? "").slice(0, 10),
      vendor: r.vendor ?? null,
      projectId: r.project_id ?? null,
      projectName: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
      amount: Number(r.amount) || 0,
      status: (r.status ?? "").toString() || "pending",
    }));

    const payRaw = (paymentsRes.data ?? []) as { id: string; payment_date?: string; amount?: number | null; payment_method?: string | null; notes?: string | null }[];
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
