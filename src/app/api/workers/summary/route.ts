import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getDailyWorkEntriesInRange, totalPayForEntry } from "@/lib/daily-work-db";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { getWorkers } from "@/lib/labor-db";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { getWorkerInvoices, type WorkerInvoice } from "@/lib/worker-invoices-db";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

type WorkerSummaryRow = {
  workerId: string;
  workerName: string;
  workDays: number;
  earned: number;
  paid: number;
  outstanding: number;
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function safeDate(value: string | null, fallback: string): string {
  const v = value?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const defaultFrom = startOfMonth.toISOString().slice(0, 10);

  const { searchParams } = new URL(request.url);
  const fromDate = safeDate(searchParams.get("fromDate"), defaultFrom);
  const toDate = safeDate(searchParams.get("toDate"), today);

  try {
    const [workers, laborEntries, invoicesAll, payments] = await Promise.all([
      getWorkers(supabase),
      getLaborEntriesWithJoins({ date_from: fromDate, date_to: toDate }, supabase).catch(() => []),
      getWorkerInvoices(supabase).catch(() => [] as WorkerInvoice[]),
      getWorkerPaymentsWithClient(supabase, { fromDate, toDate, limit: 5000 }).catch(() => []),
    ]);

    const laborByWorker = new Map<string, number>();
    const workDaysByWorker = new Map<string, number>();
    for (const entry of laborEntries) {
      const workerId = entry.worker_id;
      if (!workerId) continue;
      laborByWorker.set(workerId, (laborByWorker.get(workerId) ?? 0) + (entry.cost_amount ?? 0));
      workDaysByWorker.set(workerId, (workDaysByWorker.get(workerId) ?? 0) + 1);
    }

    if (laborEntries.length === 0) {
      const daily = await getDailyWorkEntriesInRange(fromDate, toDate, supabase).catch(() => []);
      for (const entry of daily) {
        laborByWorker.set(
          entry.workerId,
          (laborByWorker.get(entry.workerId) ?? 0) + totalPayForEntry(entry)
        );
        if (entry.dayType !== "absent") {
          workDaysByWorker.set(entry.workerId, (workDaysByWorker.get(entry.workerId) ?? 0) + 1);
        }
      }
    }

    const invoiceByWorker = new Map<string, number>();
    for (const invoice of invoicesAll) {
      const date = invoice.createdAt?.slice(0, 10) ?? "";
      if (date && (date < fromDate || date > toDate)) continue;
      invoiceByWorker.set(
        invoice.workerId,
        (invoiceByWorker.get(invoice.workerId) ?? 0) + (Number(invoice.amount) || 0)
      );
    }

    const paidByWorker = new Map<string, number>();
    for (const payment of payments) {
      paidByWorker.set(
        payment.workerId,
        (paidByWorker.get(payment.workerId) ?? 0) + (Number(payment.amount) || 0)
      );
    }

    const nameById = new Map(workers.map((worker) => [worker.id, worker.name] as const));
    const rows: WorkerSummaryRow[] = workers.map((worker) => {
      const labor = laborByWorker.get(worker.id) ?? 0;
      const invoice = invoiceByWorker.get(worker.id) ?? 0;
      const earned = labor + invoice;
      const paid = paidByWorker.get(worker.id) ?? 0;
      return {
        workerId: worker.id,
        workerName: nameById.get(worker.id) ?? worker.name ?? worker.id,
        workDays: workDaysByWorker.get(worker.id) ?? 0,
        earned,
        paid,
        outstanding: earned - paid,
      };
    });

    return NextResponse.json({ ok: true, rows }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load worker summary.";
    return apiError(500, message);
  }
}
