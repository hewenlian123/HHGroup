import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { getProjects } from "@/lib/projects-db";
import { getWorkers, getLaborInvoices } from "@/lib/labor-db";
import { getDailyWorkEntriesInRange } from "@/lib/daily-work-db";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { getWorkerReimbursements } from "@/lib/worker-reimbursements-db";
import { getWorkerInvoices } from "@/lib/worker-invoices-db";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";
import { getWorkerAdvances } from "@/lib/worker-advances-db";
import {
  buildPayrollSummaryRows,
  mergePayrollLaborEntries,
} from "@/app/labor/payroll/compute-payroll-summary-rows";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
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
  const projectFilter = searchParams.get("projectId")?.trim() || null;

  try {
    const [
      workers,
      projects,
      dailyWorkEntries,
      laborEntries,
      reimbursementsAll,
      workerInvoicesAll,
      laborInvoicesAll,
      paymentsAll,
      advancesAll,
    ] = await Promise.all([
      getWorkers(supabase),
      getProjects(supabase),
      getDailyWorkEntriesInRange(fromDate, toDate, supabase),
      getLaborEntriesWithJoins({ date_from: fromDate, date_to: toDate }, supabase),
      getWorkerReimbursements(supabase),
      getWorkerInvoices(supabase),
      getLaborInvoices(supabase),
      getWorkerPaymentsWithClient(supabase, { fromDate, toDate }),
      getWorkerAdvances({ fromDate, toDate }, supabase),
    ]);

    const rows = buildPayrollSummaryRows({
      fromDate,
      toDate,
      projectFilter,
      includeLaborInvoices: true,
      workers,
      laborEntries: mergePayrollLaborEntries(dailyWorkEntries, laborEntries),
      reimbursementsAll,
      workerInvoicesAll,
      laborInvoicesAll,
      paymentsAll,
      advancesAll,
    });

    return NextResponse.json(
      {
        ok: true,
        projects,
        rows,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load payroll summary.";
    return apiError(500, message);
  }
}
