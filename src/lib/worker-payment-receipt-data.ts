/**
 * Server data for /labor/payments/[id]/receipt — labor lines, reimb lines, balance snapshot.
 */

import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  isLaborUnpaidForWorkerPayroll,
  laborSessionLabel,
  type LaborPayrollSettlementMode,
} from "@/lib/labor-balance-shared";

export type ReceiptLaborLine = {
  id: string;
  workDate: string;
  projectName: string | null;
  session: string;
  amount: number;
};

export type ReceiptReimbLine = {
  id: string;
  vendor: string | null;
  projectName: string | null;
  amount: number;
};

export type WorkerBalanceSnapshot = {
  /** Balance owed after this payment (current). */
  remainingBalance: number;
  /** Estimated balance before this payment (remaining + payment amount). */
  previousBalance: number;
  laborOwed: number;
  reimbursementsUnpaid: number;
  totalPayments: number;
  advances: number;
};

export type WorkerPaymentReceiptPayload = {
  laborLines: ReceiptLaborLine[];
  reimbLines: ReceiptReimbLine[];
  laborSubtotal: number;
  reimbSubtotal: number;
  balance: WorkerBalanceSnapshot;
};

type LaborRowRaw = {
  id: string;
  work_date?: string;
  project_id?: string | null;
  project_am_id?: string | null;
  project_pm_id?: string | null;
  cost_amount?: number | null;
  total?: number | null;
  morning?: boolean | null;
  afternoon?: boolean | null;
};

function mergeLaborRowsById(rows: LaborRowRaw[]): LaborRowRaw[] {
  const byId = new Map<string, LaborRowRaw>();
  for (const r of rows) {
    if (r?.id) byId.set(r.id, r);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const da = (a.work_date ?? "").slice(0, 10);
    const db = (b.work_date ?? "").slice(0, 10);
    return db.localeCompare(da);
  });
}

/**
 * Load labor + reimb rows tied to this worker_payments row and current balance snapshot.
 * Labor lines: union of rows with worker_payment_id = paymentId and rows listed in
 * worker_payments.labor_entry_ids (backward-compatible when FK link was missing).
 */
export async function getWorkerPaymentReceiptPayload(
  paymentId: string,
  workerId: string,
  paymentAmount: number,
  options?: {
    laborEntryIdsFromPayment?: string[] | null;
  }
): Promise<WorkerPaymentReceiptPayload | null> {
  const c = getServerSupabaseAdmin();
  if (!c) return null;

  const projectNameById = new Map<string, string | null>();
  const { data: projects } = await c.from("projects").select("id, name");
  for (const p of (projects ?? []) as { id: string; name: string | null }[]) {
    projectNameById.set(p.id, p.name ?? null);
  }

  const laborRes = await c
    .from("labor_entries")
    .select(
      "id, work_date, project_am_id, project_pm_id, cost_amount, total, morning, afternoon, worker_payment_id"
    )
    .eq("worker_payment_id", paymentId)
    .eq("worker_id", workerId);

  const laborFromLink = (!laborRes.error ? laborRes.data ?? [] : []) as LaborRowRaw[];

  const extraIds = Array.from(
    new Set((options?.laborEntryIdsFromPayment ?? []).filter((x): x is string => typeof x === "string" && x.length > 0))
  );
  let laborFromIds: LaborRowRaw[] = [];
  if (extraIds.length > 0) {
    const byIdsRes = await c
      .from("labor_entries")
      .select(
        "id, work_date, project_am_id, project_pm_id, cost_amount, total, morning, afternoon, worker_payment_id"
      )
      .eq("worker_id", workerId)
      .in("id", extraIds);
    laborFromIds = (!byIdsRes.error ? byIdsRes.data ?? [] : []) as LaborRowRaw[];
  }

  const laborRaw = mergeLaborRowsById([...laborFromLink, ...laborFromIds]);

  const laborLines: ReceiptLaborLine[] = laborRaw.map((r) => {
    const pid = r.project_id ?? r.project_am_id ?? r.project_pm_id ?? null;
    const session = laborSessionLabel({ morning: r.morning, afternoon: r.afternoon }) ?? "—";
    return {
      id: r.id,
      workDate: (r.work_date ?? "").slice(0, 10),
      projectName: pid ? projectNameById.get(pid) ?? null : null,
      session,
      amount: Number(r.cost_amount ?? r.total) || 0,
    };
  });

  const laborSubtotal = laborLines.reduce((s, x) => s + x.amount, 0);

  const reimbRes = await c
    .from("worker_reimbursements")
    .select("id, vendor, amount, project_id, payment_id")
    .eq("payment_id", paymentId)
    .order("id", { ascending: false });

  const reimbRaw = (!reimbRes.error ? reimbRes.data ?? [] : []) as {
    id: string;
    vendor?: string | null;
    amount?: number | null;
    project_id?: string | null;
  }[];

  const reimbLines: ReceiptReimbLine[] = reimbRaw.map((r) => ({
    id: r.id,
    vendor: r.vendor ?? null,
    projectName: r.project_id ? projectNameById.get(r.project_id) ?? null : null,
    amount: Number(r.amount) || 0,
  }));

  const reimbSubtotal = reimbLines.reduce((s, x) => s + x.amount, 0);

  const balance = await computeWorkerBalanceSnapshot(c, workerId, paymentAmount);

  return {
    laborLines,
    reimbLines,
    laborSubtotal,
    reimbSubtotal,
    balance,
  };
}

async function computeWorkerBalanceSnapshot(
  c: NonNullable<ReturnType<typeof getServerSupabaseAdmin>>,
  workerId: string,
  paymentAmount: number
): Promise<WorkerBalanceSnapshot> {
  const laborFull = await c.from("labor_entries").select("cost_amount, status, worker_payment_id").eq("worker_id", workerId);
  let laborRows: {
    cost_amount?: number | null;
    status?: string | null;
    worker_payment_id?: string | null;
  }[];
  let laborSettlementMode: LaborPayrollSettlementMode = "payment_link";
  if (!laborFull.error) {
    laborRows = (laborFull.data ?? []) as typeof laborRows;
  } else if (/column.*worker_payment_id|schema cache/i.test(laborFull.error.message ?? "")) {
    laborSettlementMode = "status_fallback";
    const fb = await c.from("labor_entries").select("cost_amount, status").eq("worker_id", workerId);
    laborRows = ((fb.data ?? []) as { cost_amount?: number | null; status?: string | null }[]).map((r) => ({
      ...r,
      worker_payment_id: null as string | null,
    }));
  } else {
    laborRows = [];
  }

  let laborOwed = 0;
  for (const r of laborRows) {
    if (!isLaborUnpaidForWorkerPayroll(r.status, r.worker_payment_id, laborSettlementMode)) continue;
    laborOwed += Number(r.cost_amount) || 0;
  }

  const reimbRes = await c.from("worker_reimbursements").select("amount, status").eq("worker_id", workerId);
  let reimbUnpaid = 0;
  for (const r of (reimbRes.data ?? []) as { amount?: number | null; status?: string | null }[]) {
    if (String(r.status ?? "").toLowerCase() === "paid") continue;
    reimbUnpaid += Number(r.amount) || 0;
  }

  const payRes = await c.from("worker_payments").select("total_amount").eq("worker_id", workerId);
  let totalPayments = 0;
  if (!payRes.error) {
    for (const r of (payRes.data ?? []) as { total_amount?: number | null }[]) {
      totalPayments += Number(r.total_amount) || 0;
    }
  } else if (/column.*total_amount|schema cache/i.test(payRes.error.message ?? "")) {
    const payFb = await c.from("worker_payments").select("amount").eq("worker_id", workerId);
    if (!payFb.error) {
      for (const r of (payFb.data ?? []) as { amount?: number | null }[]) {
        totalPayments += Number(r.amount) || 0;
      }
    }
  }

  const advancesTotal = await sumAdvances(c, workerId);
  const remainingBalance = laborOwed + reimbUnpaid - totalPayments - advancesTotal;

  return {
    remainingBalance,
    previousBalance: remainingBalance + paymentAmount,
    laborOwed,
    reimbursementsUnpaid: reimbUnpaid,
    totalPayments,
    advances: advancesTotal,
  };
}

async function sumAdvances(
  c: NonNullable<ReturnType<typeof getServerSupabaseAdmin>>,
  workerId: string
): Promise<number> {
  const advRes = await c.from("worker_advances").select("amount, status").eq("worker_id", workerId);
  if (advRes.error) return 0;
  let s = 0;
  for (const r of (advRes.data ?? []) as { amount?: number | null; status?: string | null }[]) {
    const st = String(r.status ?? "").toLowerCase();
    if (st !== "pending" && st !== "deducted") continue;
    s += Number(r.amount) || 0;
  }
  return s;
}
