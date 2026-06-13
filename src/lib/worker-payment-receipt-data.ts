/**
 * Server data for /labor/payments/[id]/receipt — labor lines, reimb lines, balance snapshot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import {
  isLaborUnpaidForWorkerPayroll,
  isWorkerAdvanceOpenForBalance,
  laborEntryPaymentIdMapFromWorkerPayments,
  laborSessionLabel,
  workerOutstandingBalanceFromUnsettledItems,
  type LaborPayrollSettlementMode,
} from "@/lib/labor-balance-shared";

export type ReceiptLaborLine = {
  id: string;
  workDate: string;
  projectName: string | null;
  session: string;
  amount: number;
  dateLabel?: string;
  sessionLabel?: string;
  sourceLineCount?: number;
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
  amount_snapshot?: number | null;
  labor_cost_snapshot?: number | null;
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
  return Array.from(byId.values());
}

function receiptDateSortValue(iso: string): string | null {
  const date = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function receiptLaborSessionRank(session: string): number | null {
  const s = session.trim().toLowerCase();
  if (s === "full day" || s === "full_day") return 0;
  if (s === "morning" || s === "am" || s === "half day (am)") return 1;
  if (s === "afternoon" || s === "pm" || s === "half day (pm)") return 2;
  if (s === "ot" || s === "overtime") return 3;
  return null;
}

function receiptLaborSessionKind(session: string): "full" | "am" | "pm" | "ot" | null {
  const s = session.trim().toLowerCase();
  if (s === "full day" || s === "full_day") return "full";
  if (s === "morning" || s === "am" || s === "half day (am)") return "am";
  if (s === "afternoon" || s === "pm" || s === "half day (pm)") return "pm";
  if (s === "ot" || s === "overtime") return "ot";
  return null;
}

function sortReceiptLaborLines(lines: ReceiptLaborLine[]): ReceiptLaborLine[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const da = receiptDateSortValue(a.line.workDate);
      const db = receiptDateSortValue(b.line.workDate);
      if (da && db && da !== db) return da.localeCompare(db);
      if (da && !db) return -1;
      if (!da && db) return 1;

      if (da && db) {
        const sa = receiptLaborSessionRank(a.line.session);
        const sb = receiptLaborSessionRank(b.line.session);
        if (sa != null && sb != null && sa !== sb) return sa - sb;
      }

      return a.index - b.index;
    })
    .map(({ line }) => line);
}

const receiptLaborFullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const receiptLaborMonthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
});

type ReceiptDateParts = {
  ymd: string;
  year: number;
  month: number;
  day: number;
  utcDay: number;
  localDate: Date;
};

function receiptLaborDateParts(iso: string): ReceiptDateParts | null {
  const ymd = receiptDateSortValue(iso);
  if (!ymd) return null;
  const [, yy, mm, dd] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) ?? [];
  const year = Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const localDate = new Date(year, month - 1, day);
  if (Number.isNaN(localDate.getTime())) return null;
  return {
    ymd,
    year,
    month,
    day,
    utcDay: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
    localDate,
  };
}

function receiptLaborDateLabel(startIso: string, endIso: string): string {
  const start = receiptLaborDateParts(startIso);
  const end = receiptLaborDateParts(endIso);
  if (!start || !end) return startIso || endIso || "—";
  if (start.ymd === end.ymd) return receiptLaborFullDateFormatter.format(start.localDate);
  const startLabel =
    start.year === end.year
      ? receiptLaborMonthDayFormatter.format(start.localDate)
      : receiptLaborFullDateFormatter.format(start.localDate);
  return `${startLabel}–${receiptLaborFullDateFormatter.format(end.localDate)}`;
}

function receiptLaborSingleSessionLabel(session: string): string {
  const kind = receiptLaborSessionKind(session);
  if (kind === "full") return "Full day";
  if (kind === "am") return "Half day (AM)";
  if (kind === "pm") return "Half day (PM)";
  if (kind === "ot") return "OT";
  return session;
}

function receiptLaborGroupedSessionLabel(session: string, count: number): string {
  const kind = receiptLaborSessionKind(session);
  if (count <= 1 || !kind) return receiptLaborSingleSessionLabel(session);
  if (kind === "full") return `${count} days`;
  if (kind === "am") return `${count} AM sessions`;
  if (kind === "pm") return `${count} PM sessions`;
  return `${count} OT sessions`;
}

function receiptLaborAmountKey(amount: number): number | null {
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function canGroupReceiptLaborLine(
  prev: ReceiptLaborLine,
  prevEndWorkDate: string,
  prevDailyAmountKey: number | null,
  next: ReceiptLaborLine
): boolean {
  const prevStart = receiptLaborDateParts(prevEndWorkDate);
  const nextStart = receiptLaborDateParts(next.workDate);
  if (!prevStart || !nextStart) return false;
  if (nextStart.utcDay !== prevStart.utcDay + 1) return false;

  const project = prev.projectName?.trim();
  if (!project || project !== next.projectName?.trim()) return false;

  const prevSession = receiptLaborSessionKind(prev.session);
  if (!prevSession || prevSession !== receiptLaborSessionKind(next.session)) return false;

  const nextAmount = receiptLaborAmountKey(next.amount);
  return prevDailyAmountKey != null && prevDailyAmountKey === nextAmount;
}

/**
 * Display-only grouping for Worker Payment Receipt labor rows.
 * Raw labor_entries stay one row per day; only the receipt payload is grouped.
 */
export function groupReceiptLaborLinesForDisplay(lines: ReceiptLaborLine[]): ReceiptLaborLine[] {
  const sorted = sortReceiptLaborLines(lines);
  const groups: Array<{
    dailyAmountKey: number | null;
    endWorkDate: string;
    line: ReceiptLaborLine;
  }> = [];

  for (const line of sorted) {
    const last = groups[groups.length - 1];
    if (last && canGroupReceiptLaborLine(last.line, last.endWorkDate, last.dailyAmountKey, line)) {
      const count = (last.line.sourceLineCount ?? 1) + 1;
      last.line.id = `${last.line.id}..${line.id}`;
      last.line.amount += line.amount;
      last.line.dateLabel = receiptLaborDateLabel(last.line.workDate, line.workDate);
      last.line.sessionLabel = receiptLaborGroupedSessionLabel(last.line.session, count);
      last.line.sourceLineCount = count;
      last.endWorkDate = line.workDate;
      continue;
    }

    groups.push({
      dailyAmountKey: receiptLaborAmountKey(line.amount),
      endWorkDate: line.workDate,
      line: {
        ...line,
        dateLabel: receiptLaborDateLabel(line.workDate, line.workDate),
        sessionLabel: receiptLaborSingleSessionLabel(line.session),
        sourceLineCount: 1,
      },
    });
  }

  return groups.map((group) => group.line);
}

/** Try sparse columns first (no project_* / total / AM-PM ids), then richer shapes. */
const LABOR_RECEIPT_SELECT_VARIANTS = [
  "id, work_date, project_id, labor_cost_snapshot, amount_snapshot, cost_amount, status, worker_payment_id, morning, afternoon, hours, notes",
  "id, work_date, cost_amount, cost_code, status, worker_payment_id, morning, afternoon, hours, notes",
  "id, work_date, cost_amount, status, worker_payment_id, morning, afternoon, hours, notes",
  "id, work_date, cost_amount, status, worker_payment_id, morning, afternoon",
  "id, work_date, cost_amount, status, worker_payment_id",
  "id, work_date, cost_amount, total, morning, afternoon, worker_payment_id",
  "id, work_date, cost_amount, total, worker_payment_id",
  "id, work_date, project_id, cost_amount, total, morning, afternoon, worker_payment_id",
  "id, work_date, project_id, cost_amount, total, worker_payment_id",
  "id, work_date, project_id, project_am_id, project_pm_id, cost_amount, total, morning, afternoon, worker_payment_id",
  "id, work_date, project_id, project_am_id, project_pm_id, cost_amount, total, worker_payment_id",
  "id, work_date, project_am_id, project_pm_id, cost_amount, total, morning, afternoon, worker_payment_id",
  "id, work_date, project_am_id, project_pm_id, cost_amount, total, worker_payment_id",
] as const;

function isRetryableLaborSelectError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /column|schema cache|could not find|pgrst204/i.test(m);
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
  const c = getServerSupabaseInternalNoStore();
  if (!c) return null;

  const projectNameById = new Map<string, string | null>();
  const { data: projects } = await c.from("projects").select("id, name");
  for (const p of (projects ?? []) as { id: string; name: string | null }[]) {
    projectNameById.set(p.id, p.name ?? null);
  }

  const loadLaborRows = async (): Promise<LaborRowRaw[]> => {
    let laborFromLink: LaborRowRaw[] = [];
    for (const sel of LABOR_RECEIPT_SELECT_VARIANTS) {
      const laborRes = await c
        .from("labor_entries")
        .select(sel)
        .eq("worker_payment_id", paymentId)
        .eq("worker_id", workerId);
      if (!laborRes.error) {
        laborFromLink = (laborRes.data ?? []) as unknown as LaborRowRaw[];
        break;
      }
      if (!isRetryableLaborSelectError(laborRes.error)) break;
    }

    let extraIds = Array.from(
      new Set(
        (options?.laborEntryIdsFromPayment ?? []).filter(
          (x): x is string => typeof x === "string" && x.length > 0
        )
      )
    );
    if (extraIds.length === 0) {
      const payMeta = await c
        .from("worker_payments")
        .select("labor_entry_ids")
        .eq("id", paymentId)
        .maybeSingle();
      if (!payMeta.error && payMeta.data) {
        const raw = (payMeta.data as { labor_entry_ids?: unknown }).labor_entry_ids;
        if (Array.isArray(raw)) {
          extraIds = Array.from(
            new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0))
          );
        }
      }
    }
    let laborFromIds: LaborRowRaw[] = [];
    if (extraIds.length > 0) {
      for (const sel of LABOR_RECEIPT_SELECT_VARIANTS) {
        const byIdsRes = await c
          .from("labor_entries")
          .select(sel)
          .eq("worker_id", workerId)
          .in("id", extraIds);
        if (!byIdsRes.error) {
          laborFromIds = (byIdsRes.data ?? []) as unknown as LaborRowRaw[];
          break;
        }
        if (!isRetryableLaborSelectError(byIdsRes.error)) break;
      }
    }

    return mergeLaborRowsById([...laborFromLink, ...laborFromIds]);
  };

  let laborRaw = await loadLaborRows();
  for (let bump = 0; bump < 8 && laborRaw.length === 0 && paymentAmount > 0.05; bump++) {
    await new Promise((r) => setTimeout(r, 200));
    laborRaw = await loadLaborRows();
  }

  const laborLines: ReceiptLaborLine[] = groupReceiptLaborLinesForDisplay(
    laborRaw.map((r) => {
      const pid = r.project_id ?? r.project_am_id ?? r.project_pm_id ?? null;
      const session = laborSessionLabel({ morning: r.morning, afternoon: r.afternoon }) ?? "—";
      return {
        id: r.id,
        workDate: (r.work_date ?? "").slice(0, 10),
        projectName: pid ? (projectNameById.get(pid) ?? null) : null,
        session,
        amount: Number(r.labor_cost_snapshot ?? r.amount_snapshot ?? r.cost_amount ?? r.total) || 0,
      };
    })
  );

  const laborSubtotal = laborLines.reduce((s, x) => s + x.amount, 0);

  const reimbRes = await c
    .from("worker_reimbursements")
    .select("id, vendor, amount, project_id, payment_id")
    .eq("payment_id", paymentId)
    .order("id", { ascending: false });

  const reimbRaw = (!reimbRes.error ? (reimbRes.data ?? []) : []) as {
    id: string;
    vendor?: string | null;
    amount?: number | null;
    project_id?: string | null;
  }[];

  const reimbLines: ReceiptReimbLine[] = reimbRaw.map((r) => ({
    id: r.id,
    vendor: r.vendor ?? null,
    projectName: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
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
  c: SupabaseClient,
  workerId: string,
  paymentAmount: number
): Promise<WorkerBalanceSnapshot> {
  const laborFull = await c
    .from("labor_entries")
    .select("id, labor_cost_snapshot, amount_snapshot, cost_amount, status, worker_payment_id")
    .eq("worker_id", workerId);
  let laborRows: {
    id?: string | null;
    amount_snapshot?: number | null;
    labor_cost_snapshot?: number | null;
    cost_amount?: number | null;
    status?: string | null;
    worker_payment_id?: string | null;
  }[];
  let laborSettlementMode: LaborPayrollSettlementMode = "payment_link";
  if (!laborFull.error) {
    laborRows = (laborFull.data ?? []) as typeof laborRows;
  } else if (/column.*worker_payment_id|schema cache/i.test(laborFull.error.message ?? "")) {
    laborSettlementMode = "status_fallback";
    const fb = await c
      .from("labor_entries")
      .select("id, labor_cost_snapshot, amount_snapshot, cost_amount, status")
      .eq("worker_id", workerId);
    laborRows = (
      (fb.data ?? []) as {
        id?: string | null;
        amount_snapshot?: number | null;
        labor_cost_snapshot?: number | null;
        cost_amount?: number | null;
        status?: string | null;
      }[]
    ).map((r) => ({
      ...r,
      worker_payment_id: null as string | null,
    }));
  } else {
    laborRows = [];
  }

  type PaymentRowsResult = {
    data: unknown[] | null;
    error: { message?: string } | null;
  };
  let paymentRowsForLinks: Array<{ id?: unknown; labor_entry_ids?: unknown }> = [];
  let payRes: PaymentRowsResult = await c
    .from("worker_payments")
    .select("id, total_amount, labor_entry_ids")
    .eq("worker_id", workerId);
  if (payRes.error && /column.*labor_entry_ids|schema cache/i.test(payRes.error.message ?? "")) {
    payRes = await c.from("worker_payments").select("id, total_amount").eq("worker_id", workerId);
  }
  let totalPayments = 0;
  if (!payRes.error) {
    const rows = (payRes.data ?? []) as Array<{
      id?: unknown;
      total_amount?: number | null;
      labor_entry_ids?: unknown;
    }>;
    paymentRowsForLinks = rows;
    for (const r of rows) {
      totalPayments += Number(r.total_amount) || 0;
    }
  } else if (/column.*total_amount|schema cache/i.test(payRes.error.message ?? "")) {
    let payFb: PaymentRowsResult = await c
      .from("worker_payments")
      .select("id, amount, labor_entry_ids")
      .eq("worker_id", workerId);
    if (payFb.error && /column.*labor_entry_ids|schema cache/i.test(payFb.error.message ?? "")) {
      payFb = await c.from("worker_payments").select("id, amount").eq("worker_id", workerId);
    }
    if (!payFb.error) {
      const rows = (payFb.data ?? []) as Array<{
        id?: unknown;
        amount?: number | null;
        labor_entry_ids?: unknown;
      }>;
      paymentRowsForLinks = rows;
      for (const r of rows) {
        totalPayments += Number(r.amount) || 0;
      }
    }
  }
  const paymentIdByLaborEntryId = laborEntryPaymentIdMapFromWorkerPayments(paymentRowsForLinks);

  let laborOwed = 0;
  for (const r of laborRows) {
    const effectiveWorkerPaymentId =
      String(r.worker_payment_id ?? "").trim() ||
      paymentIdByLaborEntryId.get(String(r.id ?? "")) ||
      null;
    if (!isLaborUnpaidForWorkerPayroll(r.status, effectiveWorkerPaymentId, laborSettlementMode))
      continue;
    laborOwed += Number(r.labor_cost_snapshot ?? r.amount_snapshot ?? r.cost_amount) || 0;
  }

  const reimbRes = await c
    .from("worker_reimbursements")
    .select("amount, status")
    .eq("worker_id", workerId);
  let reimbUnpaid = 0;
  for (const r of (reimbRes.data ?? []) as { amount?: number | null; status?: string | null }[]) {
    if (String(r.status ?? "").toLowerCase() === "paid") continue;
    reimbUnpaid += Number(r.amount) || 0;
  }

  const advancesTotal = await sumAdvances(c, workerId);
  const remainingBalance = workerOutstandingBalanceFromUnsettledItems({
    laborOwed,
    reimbursements: reimbUnpaid,
    advances: advancesTotal,
  });

  return {
    remainingBalance,
    previousBalance: remainingBalance + paymentAmount,
    laborOwed,
    reimbursementsUnpaid: reimbUnpaid,
    totalPayments,
    advances: advancesTotal,
  };
}

async function sumAdvances(c: SupabaseClient, workerId: string): Promise<number> {
  const advRes = await c.from("worker_advances").select("amount, status").eq("worker_id", workerId);
  if (advRes.error) return 0;
  let s = 0;
  for (const r of (advRes.data ?? []) as { amount?: number | null; status?: string | null }[]) {
    if (!isWorkerAdvanceOpenForBalance(r.status)) continue;
    s += Number(r.amount) || 0;
  }
  return s;
}
