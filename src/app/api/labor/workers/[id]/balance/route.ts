import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseInternal } from "@/lib/supabase-server";
import {
  isLaborUnpaidForWorkerPayroll,
  laborPayrollSettlementModeFromSelectList,
  laborSessionLabel,
  resolveLaborWorkerForBalance,
  workerIdsForLaborBalanceFinancialQueries,
} from "@/lib/labor-balance-shared";

export const dynamic = "force-dynamic";

type LaborEntryRow = {
  id: string;
  date: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  /** Timesheet / workflow status (Draft, Approved, …) — not used for payroll paid/unpaid display. */
  status: string;
  /** FK to worker_payments when column exists; clients should derive payment UI via getLaborPaymentStatus. */
  workerPaymentId: string | null;
  /** Worker payout: true when linked to worker_payments (`worker_payment_id`); not inferred from workflow status. */
  payrollSettled: boolean;
  /** Morning / afternoon / full day when columns exist; explains duplicate dates. */
  session: string | null;
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
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workerId } = await params;
  if (!workerId) {
    return NextResponse.json({ message: "Worker id required" }, { status: 400 });
  }
  const c = getServerSupabaseInternal();
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
    client: SupabaseClient,
    table: string,
    cols: string,
    orderCol?: string
  ): Promise<RawResult> {
    const base = client.from(table).select(cols).eq("worker_id", workerId);
    const q = orderCol ? base.order(orderCol, { ascending: false }) : base;
    const { data, error } = await q;
    return {
      data: (data ?? null) as Record<string, unknown>[] | null,
      error: error as { message?: string } | null,
    };
  }

  try {
    const financialWorkerIds = await workerIdsForLaborBalanceFinancialQueries(c, workerId);

    const queryFinancialTable = async (
      client: SupabaseClient,
      table: "worker_payments" | "worker_reimbursements" | "worker_advances",
      cols: string,
      orderCol?: string
    ): Promise<RawResult> => {
      const ids = financialWorkerIds.length ? financialWorkerIds : [workerId];
      const base =
        ids.length <= 1
          ? client
              .from(table)
              .select(cols)
              .eq("worker_id", ids[0] ?? workerId)
          : client.from(table).select(cols).in("worker_id", ids);
      const q = orderCol ? base.order(orderCol, { ascending: false }) : base;
      const { data, error } = await q;
      return {
        data: (data ?? null) as Record<string, unknown>[] | null,
        error: error as { message?: string } | null,
      };
    };

    // labor_entries.worker_id → labor_workers; keep names consistent with Worker Balances list.
    const worker = await resolveLaborWorkerForBalance(c, workerId);

    // labor_entries — progressively strip missing columns (prefer session fields for display)
    let laborRes: RawResult = { data: null, error: null };
    let laborColsApplied = "";
    for (const cols of [
      // Sparse daily labor (no project_* / total / AM-PM ids) — try first for local & trimmed remotes.
      "id, worker_id, work_date, cost_amount, cost_code, status, worker_payment_id, morning, afternoon, hours, notes",
      "id, worker_id, work_date, cost_amount, status, worker_payment_id, morning, afternoon, hours, notes",
      "id, worker_id, work_date, cost_amount, status, worker_payment_id, morning, afternoon",
      "id, worker_id, work_date, cost_amount, status, worker_payment_id",
      "id, worker_id, work_date, cost_amount, status",
      "id, worker_id, work_date, cost_amount",
      // With total when column exists (older daily log).
      "id, worker_id, work_date, cost_amount, total, status, worker_payment_id, morning, afternoon, hours, notes",
      // project_id on row (newer unified schema).
      "id, worker_id, project_id, work_date, cost_amount, status, worker_payment_id, morning, afternoon, hours, notes",
      "id, worker_id, project_id, work_date, cost_amount, status, worker_payment_id, morning, afternoon",
      "id, worker_id, project_id, work_date, cost_amount, status, worker_payment_id",
      "id, worker_id, project_id, work_date, cost_amount, status, morning, afternoon, hours, notes",
      "id, worker_id, project_id, work_date, cost_amount, status, morning, afternoon",
      "id, worker_id, project_id, work_date, cost_amount, status",
      "id, worker_id, project_id, work_date, cost_amount",
      "id, worker_id, project_id, work_date",
    ]) {
      laborRes = await queryWorker(c, "labor_entries", cols, "work_date");
      if (!laborRes.error || !isMissingColumn(laborRes.error)) {
        laborColsApplied = cols;
        break;
      }
    }
    const laborSettlementMode = laborPayrollSettlementModeFromSelectList(laborColsApplied);

    // worker_payments — canonical: total_amount, note, created_at
    let paymentsRes: RawResult = { data: null, error: null };
    for (const cols of [
      "id, worker_id, total_amount, payment_method, note, created_at",
      "id, worker_id, total_amount, note, created_at",
      "id, worker_id, total_amount, created_at",
    ]) {
      paymentsRes = await queryFinancialTable(c, "worker_payments", cols, "created_at");
      if (!paymentsRes.error || !isMissingColumn(paymentsRes.error)) break;
    }
    if (paymentsRes.error) {
      paymentsRes = await queryFinancialTable(
        c,
        "worker_payments",
        "id, worker_id, amount, created_at",
        "created_at"
      );
    }
    if (paymentsRes.error) {
      paymentsRes = await queryFinancialTable(
        c,
        "worker_payments",
        "id, amount, created_at",
        "created_at"
      );
    }

    let reimbRes = await queryFinancialTable(
      c,
      "worker_reimbursements",
      "id, worker_id, project_id, vendor, amount, status, created_at, reimbursement_date",
      "reimbursement_date"
    );
    if (reimbRes.error && isMissingColumn(reimbRes.error)) {
      reimbRes = await queryFinancialTable(
        c,
        "worker_reimbursements",
        "id, worker_id, project_id, vendor, amount, status, created_at",
        "created_at"
      );
    }

    const [projectsRes, advancesRes] = await Promise.all([
      c.from("projects").select("id, name"),
      queryFinancialTable(c, "worker_advances", "worker_id, amount, status"),
    ]);

    if (!worker?.id) {
      return NextResponse.json({ message: "Worker not found" }, { status: 404 });
    }

    const projectRows = (projectsRes.data ?? []) as { id: string; name: string | null }[];
    const projectNameById = new Map(projectRows.map((p) => [p.id, p.name ?? null]));

    const laborRaw = (laborRes.data ?? []) as {
      id: string;
      project_id?: string | null;
      project_am_id?: string | null;
      project_pm_id?: string | null;
      work_date?: string;
      cost_amount?: number | null;
      total?: number | null;
      status?: string | null;
      worker_payment_id?: string | null;
      morning?: boolean | null;
      afternoon?: boolean | null;
    }[];
    // Stable order: newest work date first, then id (same calendar day can have multiple rows).
    const laborSorted = [...laborRaw].sort((a, b) => {
      const da = (a.work_date ?? "").slice(0, 10);
      const db = (b.work_date ?? "").slice(0, 10);
      if (da !== db) return db.localeCompare(da);
      return String(a.id).localeCompare(String(b.id));
    });
    const laborEntries: LaborEntryRow[] = laborSorted.map((r) => {
      const projectKey = r.project_id ?? r.project_am_id ?? r.project_pm_id ?? null;
      const workerPaymentId =
        laborSettlementMode === "payment_link"
          ? r.worker_payment_id != null
            ? String(r.worker_payment_id).trim() || null
            : null
          : null;
      const payrollSettled = !isLaborUnpaidForWorkerPayroll(
        r.status,
        r.worker_payment_id,
        laborSettlementMode
      );
      return {
        id: r.id,
        date: (r.work_date ?? "").slice(0, 10),
        projectId: projectKey,
        projectName: projectKey ? (projectNameById.get(projectKey) ?? null) : null,
        amount: Number(r.cost_amount ?? r.total) || 0,
        status: String(r.status ?? "").trim() || "—",
        workerPaymentId,
        payrollSettled,
        session: laborSessionLabel(r),
      };
    });

    const reimbRaw = (reimbRes.data ?? []) as {
      id: string;
      project_id: string | null;
      vendor: string | null;
      amount?: number | null;
      status?: string | null;
      created_at?: string;
      reimbursement_date?: string | null;
    }[];
    const reimbRowDisplayDate = (r: (typeof reimbRaw)[0]): string => {
      const rd = r.reimbursement_date;
      if (typeof rd === "string" && /^\d{4}-\d{2}-\d{2}/.test(rd)) return rd.slice(0, 10);
      return (r.created_at ?? "").slice(0, 10);
    };
    const reimbursements: ReimbursementRow[] = reimbRaw.map((r) => ({
      id: r.id,
      date: reimbRowDisplayDate(r),
      vendor: r.vendor ?? null,
      projectId: r.project_id ?? null,
      projectName: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
      amount: Number(r.amount) || 0,
      status: String(r.status ?? "") || "pending",
    }));

    const payRaw = (paymentsRes.data ?? []) as {
      id: string;
      payment_date?: string;
      created_at?: string;
      amount?: number | null;
      total_amount?: number | null;
      payment_method?: string | null;
      notes?: string | null;
      note?: string | null;
    }[];
    const payments: PaymentRow[] = payRaw.map((r) => ({
      id: r.id,
      date: (r.payment_date ?? r.created_at ?? "").slice(0, 10),
      amount: Number(r.total_amount ?? r.amount) || 0,
      paymentMethod: r.payment_method ?? null,
      notes: (r.notes ?? r.note ?? null) as string | null,
    }));

    const laborOwed = laborRaw
      .filter((r) =>
        isLaborUnpaidForWorkerPayroll(r.status, r.worker_payment_id, laborSettlementMode)
      )
      .reduce((s, r) => s + (Number(r.cost_amount ?? r.total) || 0), 0);
    const reimbUnpaid = reimbRaw
      .filter((r) => String(r.status ?? "").toLowerCase() !== "paid")
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalPayments = payRaw.reduce((s, r) => s + (Number(r.total_amount ?? r.amount) || 0), 0);
    const advancesRows = !advancesRes.error
      ? ((advancesRes.data ?? []) as {
          worker_id: string;
          amount?: number | null;
          status?: string | null;
        }[])
      : [];
    const advancesTotal = advancesRows.reduce((s, r) => {
      const st = String(r.status ?? "")
        .trim()
        .toLowerCase();
      if (st !== "deducted") return s;
      return s + (Number(r.amount) || 0);
    }, 0);
    const balance = laborOwed + reimbUnpaid - totalPayments - advancesTotal;

    return NextResponse.json({
      worker: { id: worker.id, name: worker.name },
      laborPayrollSettlementMode: laborSettlementMode,
      summary: {
        laborOwed,
        reimbursements: reimbUnpaid,
        payments: totalPayments,
        advances: advancesTotal,
        balance,
      },
      laborEntries,
      reimbursements,
      payments,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker balance";
    return NextResponse.json({ message }, { status: 500 });
  }
}
