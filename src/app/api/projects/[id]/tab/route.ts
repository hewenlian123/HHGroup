import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import {
  getProjectBillingSummary,
  getProjectTransactions,
  getProjectExpenseLines,
  getDocumentsByProject,
  getSourceForProject,
  getChangeOrdersByProject,
  getLaborEntriesWithJoins,
  getProjectLaborBreakdown,
  getSubcontractsByProject,
  getBillsBySubcontractIds,
  getPaymentsBySubcontractIds,
  getProjectTasks,
  getProjectSchedule,
  getActivityLogsByProject,
  getWorkers,
  getCloseoutPunch,
  getCloseoutWarranty,
  getCloseoutCompletion,
  getSelectionsByProject,
  getMaterialCatalog,
  getCommissionsByProject,
  getPunchListByProject,
} from "@/lib/data";
import { getApBillsByProject } from "@/lib/ap-bills-db";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";

type TabKey =
  | "overview"
  | "tasks"
  | "schedule"
  | "financial"
  | "budget"
  | "expenses"
  | "change-orders"
  | "labor"
  | "subcontracts"
  | "bills"
  | "documents"
  | "activity"
  | "materials"
  | "closeout"
  | "commission"
  | "punch-list";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false as const, message }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(_req, { noStore: true });
  if (!guard.ok) return guard.response;
  const supabase = guard.client;

  const { id } = await ctx.params;
  const url = new URL(_req.url);
  const key = (url.searchParams.get("key") ?? "overview").toLowerCase() as TabKey;

  if (!id?.trim()) return jsonError("Missing project id", 400);

  try {
    if (key === "financial") {
      const [canonical, billingSummary] = await Promise.all([
        getCanonicalProjectProfit(id, supabase),
        getProjectBillingSummary(id, supabase),
      ]);
      return NextResponse.json({ ok: true as const, key, canonical, billingSummary });
    }

    if (key === "overview") {
      const [transactions, expenseLines] = await Promise.all([
        Promise.resolve(getProjectTransactions(id)),
        getProjectExpenseLines(id, supabase),
      ]);
      return NextResponse.json({
        ok: true as const,
        key,
        transactions,
        expenseLines,
      });
    }

    if (key === "tasks") {
      const [tasks, workers] = await Promise.all([
        getProjectTasks(id, supabase),
        getWorkers(supabase),
      ]);
      return NextResponse.json({ ok: true as const, key, tasks, workers });
    }

    if (key === "schedule") {
      const schedule = await getProjectSchedule(id, supabase);
      return NextResponse.json({ ok: true as const, key, schedule });
    }

    if (key === "budget") {
      const [canonical, billingSummary, sourceFromEstimate] = await Promise.all([
        getCanonicalProjectProfit(id, supabase),
        getProjectBillingSummary(id, supabase),
        getSourceForProject(id, supabase),
      ]);
      return NextResponse.json({
        ok: true as const,
        key,
        canonical,
        billingSummary,
        sourceFromEstimate,
      });
    }

    if (key === "expenses") {
      const expenseLines = await getProjectExpenseLines(id, supabase);
      return NextResponse.json({ ok: true as const, key, expenseLines });
    }

    if (key === "documents") {
      const documents = await getDocumentsByProject(id);
      return NextResponse.json({ ok: true as const, key, documents });
    }

    if (key === "activity") {
      const [transactions, activityLogs] = await Promise.all([
        Promise.resolve(getProjectTransactions(id)),
        getActivityLogsByProject(id, 100),
      ]);
      return NextResponse.json({ ok: true as const, key, transactions, activityLogs });
    }

    if (key === "change-orders") {
      const changeOrders = await getChangeOrdersByProject(id, supabase);
      const response = NextResponse.json({ ok: true as const, key, changeOrders });
      for (const cookie of guard.sessionResponse.cookies.getAll()) response.cookies.set(cookie);
      return response;
    }

    if (key === "labor") {
      const [laborBreakdownRows, laborEntries] = await Promise.all([
        getProjectLaborBreakdown(id, supabase),
        getLaborEntriesWithJoins({ project_id: id }, supabase),
      ]);
      return NextResponse.json({ ok: true as const, key, laborBreakdownRows, laborEntries });
    }

    if (key === "subcontracts") {
      const subcontracts = await getSubcontractsByProject(id, supabase);
      const subcontractIds = subcontracts.map((s) => s.id);
      const [bills, payments] = await Promise.all([
        getBillsBySubcontractIds(subcontractIds, supabase),
        getPaymentsBySubcontractIds(subcontractIds, supabase),
      ]);
      return NextResponse.json({ ok: true as const, key, subcontracts, bills, payments });
    }

    if (key === "bills") {
      const projectBills = await getApBillsByProject(id, supabase);
      return NextResponse.json({ ok: true as const, key, projectBills });
    }

    if (key === "materials") {
      const [selections, catalog] = await Promise.all([
        getSelectionsByProject(id),
        getMaterialCatalog(),
      ]);
      return NextResponse.json({ ok: true as const, key, selections, catalog });
    }

    if (key === "closeout") {
      const [punch, warranty, completion] = await Promise.all([
        getCloseoutPunch(id).catch(() => null),
        getCloseoutWarranty(id).catch(() => null),
        getCloseoutCompletion(id).catch(() => null),
      ]);
      return NextResponse.json({ ok: true as const, key, punch, warranty, completion });
    }

    if (key === "commission") {
      const commissions = await getCommissionsByProject(id, supabase);
      const response = NextResponse.json({ ok: true as const, key, commissions });
      for (const cookie of guard.sessionResponse.cookies.getAll()) response.cookies.set(cookie);
      return response;
    }

    if (key === "punch-list") {
      const [punchItems, workers] = await Promise.all([
        getPunchListByProject(id, supabase),
        getWorkers(supabase),
      ]);
      return NextResponse.json({ ok: true as const, key, punchItems, workers });
    }

    return jsonError("Unknown tab key", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tab data.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
