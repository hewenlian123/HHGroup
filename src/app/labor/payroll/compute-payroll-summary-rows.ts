import { totalPayForEntry, type DailyWorkEntry } from "@/lib/daily-work-db";
import type { WorkerReimbursement } from "@/lib/worker-reimbursements-db";
import type { WorkerInvoice } from "@/lib/worker-invoices-db";
import type { LaborInvoice } from "@/lib/labor-db";
import type { WorkerPayment } from "@/lib/worker-payments-db";
import type { WorkerAdvance } from "@/lib/worker-advances-db";

export type PayrollSummaryComputeRow = {
  workerId: string;
  workerName: string;
  laborOwed: number;
  workerInvoices: number;
  laborInvoices: number;
  earned: number;
  reimbursements: number;
  shouldPay: number;
  paid: number;
  balance: number;
};

export function balanceStatusLabel(balance: number): "Unpaid" | "Balanced" | "Overpaid" {
  const r = Math.round(balance * 100) / 100;
  if (r > 0) return "Unpaid";
  if (r < 0) return "Overpaid";
  return "Balanced";
}

export function laborInvoiceLineAmount(
  inv: LaborInvoice,
  fromDate: string,
  toDate: string,
  projectFilter: string | null,
  includeLaborInvoices: boolean
): number {
  if (!includeLaborInvoices || inv.status !== "confirmed") return 0;
  const d = inv.invoiceDate?.slice(0, 10) ?? "";
  if (!d || d < fromDate || d > toDate) return 0;
  if (projectFilter) {
    return inv.projectSplits
      .filter((s) => s.projectId === projectFilter)
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }
  return Number(inv.amount) || 0;
}

export type BuildPayrollSummaryRowsInput = {
  fromDate: string;
  toDate: string;
  projectFilter: string | null;
  includeLaborInvoices: boolean;
  workers: { id: string; name: string }[];
  laborEntries: DailyWorkEntry[];
  reimbursementsAll: WorkerReimbursement[];
  workerInvoicesAll: WorkerInvoice[];
  laborInvoicesAll: LaborInvoice[];
  paymentsAll: WorkerPayment[];
  advancesAll: WorkerAdvance[];
};

/**
 * Pure aggregation for Payroll Summary (/labor/payroll). Keeps formulas testable without React/Supabase.
 */
export function buildPayrollSummaryRows(
  input: BuildPayrollSummaryRowsInput
): PayrollSummaryComputeRow[] {
  const {
    fromDate,
    toDate,
    projectFilter,
    includeLaborInvoices,
    workers,
    laborEntries,
    reimbursementsAll,
    workerInvoicesAll,
    laborInvoicesAll,
    paymentsAll,
    advancesAll,
  } = input;

  const labor = laborEntries.filter((e) => (projectFilter ? e.projectId === projectFilter : true));

  const reimbursements = reimbursementsAll.filter((r) => {
    if (projectFilter && r.projectId !== projectFilter) return false;
    const d = (r.reimbursementDate ?? r.createdAt?.slice(0, 10) ?? "").slice(0, 10);
    if (d && (d < fromDate || d > toDate)) return false;
    return String(r.status ?? "").toLowerCase() !== "paid";
  });

  const workerInvoicesFiltered = workerInvoicesAll.filter((inv) => {
    if (projectFilter && inv.projectId !== projectFilter) return false;
    const d = inv.createdAt?.slice(0, 10) ?? "";
    if (d && (d < fromDate || d > toDate)) return false;
    return String(inv.status ?? "").toLowerCase() !== "paid";
  });

  const advancesInRange = advancesAll.filter((a) => {
    if (String(a.status).toLowerCase() === "cancelled") return false;
    if (projectFilter && a.projectId !== projectFilter) return false;
    const d = a.advanceDate?.slice(0, 10) ?? "";
    if (!d || d < fromDate || d > toDate) return false;
    return true;
  });

  const workerNameById = new Map(workers.map((x) => [x.id, x.name] as const));

  const laborSum = new Map<string, number>();
  for (const e of labor) {
    laborSum.set(e.workerId, (laborSum.get(e.workerId) ?? 0) + totalPayForEntry(e));
  }

  const reimbSum = new Map<string, number>();
  for (const r of reimbursements) {
    reimbSum.set(r.workerId, (reimbSum.get(r.workerId) ?? 0) + (Number(r.amount) || 0));
  }

  const workerInvSum = new Map<string, number>();
  for (const inv of workerInvoicesFiltered) {
    workerInvSum.set(
      inv.workerId,
      (workerInvSum.get(inv.workerId) ?? 0) + (Number(inv.amount) || 0)
    );
  }

  const laborInvSum = new Map<string, number>();
  for (const inv of laborInvoicesAll) {
    const add = laborInvoiceLineAmount(inv, fromDate, toDate, projectFilter, includeLaborInvoices);
    if (add <= 0) continue;
    const wid = inv.workerId;
    laborInvSum.set(wid, (laborInvSum.get(wid) ?? 0) + add);
  }

  const paySum = new Map<string, number>();
  for (const pay of paymentsAll) {
    paySum.set(pay.workerId, (paySum.get(pay.workerId) ?? 0) + (Number(pay.amount) || 0));
  }

  const advSum = new Map<string, number>();
  for (const adv of advancesInRange) {
    advSum.set(adv.workerId, (advSum.get(adv.workerId) ?? 0) + (Number(adv.amount) || 0));
  }

  const allWorkerIds = new Set<string>([
    ...Array.from(laborSum.keys()),
    ...Array.from(reimbSum.keys()),
    ...Array.from(workerInvSum.keys()),
    ...Array.from(laborInvSum.keys()),
    ...Array.from(paySum.keys()),
    ...Array.from(advSum.keys()),
  ]);

  return Array.from(allWorkerIds).map((workerId) => {
    const laborOwed = laborSum.get(workerId) ?? 0;
    const workerInvoicesAmt = workerInvSum.get(workerId) ?? 0;
    const laborInvoicesAmt = laborInvSum.get(workerId) ?? 0;
    const earned = laborOwed + workerInvoicesAmt + laborInvoicesAmt;
    const reimbursementsAmt = reimbSum.get(workerId) ?? 0;
    const shouldPay = earned + reimbursementsAmt;
    const paid = (paySum.get(workerId) ?? 0) + (advSum.get(workerId) ?? 0);
    const balance = shouldPay - paid;
    return {
      workerId,
      workerName: workerNameById.get(workerId) ?? workerId,
      laborOwed,
      workerInvoices: workerInvoicesAmt,
      laborInvoices: laborInvoicesAmt,
      earned,
      reimbursements: reimbursementsAmt,
      shouldPay,
      paid,
      balance,
    };
  });
}
