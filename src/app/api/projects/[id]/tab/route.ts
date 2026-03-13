import { NextResponse } from "next/server";
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
  getApBillsByProject,
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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(_req.url);
  const key = (url.searchParams.get("key") ?? "overview").toLowerCase() as TabKey;

  if (!id?.trim()) return jsonError("Missing project id", 400);

  try {
    if (key === "financial") {
      const [canonical, billingSummary] = await Promise.all([
        getCanonicalProjectProfit(id),
        getProjectBillingSummary(id),
      ]);
      return NextResponse.json({ ok: true as const, key, canonical, billingSummary });
    }

    if (key === "overview") {
      const [transactions, expenseLines] = await Promise.all([
        Promise.resolve(getProjectTransactions(id)),
        getProjectExpenseLines(id),
      ]);
      return NextResponse.json({
        ok: true as const,
        key,
        transactions,
        expenseLines,
      });
    }

    if (key === "tasks") {
      const [tasks, workers] = await Promise.all([getProjectTasks(id), getWorkers()]);
      return NextResponse.json({ ok: true as const, key, tasks, workers });
    }

    if (key === "schedule") {
      const schedule = await getProjectSchedule(id);
      return NextResponse.json({ ok: true as const, key, schedule });
    }

    if (key === "budget") {
      const [canonical, billingSummary, sourceFromEstimate] = await Promise.all([
        getCanonicalProjectProfit(id),
        getProjectBillingSummary(id),
        getSourceForProject(id),
      ]);
      return NextResponse.json({ ok: true as const, key, canonical, billingSummary, sourceFromEstimate });
    }

    if (key === "expenses") {
      const expenseLines = await getProjectExpenseLines(id);
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
      const changeOrders = await getChangeOrdersByProject(id);
      return NextResponse.json({ ok: true as const, key, changeOrders });
    }

    if (key === "labor") {
      const [laborBreakdownRows, laborEntries] = await Promise.all([
        getProjectLaborBreakdown(id),
        getLaborEntriesWithJoins({ project_id: id }).catch(() => []),
      ]);
      return NextResponse.json({ ok: true as const, key, laborBreakdownRows, laborEntries });
    }

    if (key === "subcontracts") {
      const subcontracts = await getSubcontractsByProject(id);
      const subcontractIds = subcontracts.map((s) => s.id);
      const [bills, payments] = await Promise.all([
        getBillsBySubcontractIds(subcontractIds),
        getPaymentsBySubcontractIds(subcontractIds),
      ]);
      return NextResponse.json({ ok: true as const, key, subcontracts, bills, payments });
    }

    if (key === "bills") {
      const projectBills = await getApBillsByProject(id).catch(() => []);
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
      const commissions = await getCommissionsByProject(id);
      return NextResponse.json({ ok: true as const, key, commissions });
    }

    if (key === "punch-list") {
      const [punchItems, workers] = await Promise.all([getPunchListByProject(id), getWorkers()]);
      return NextResponse.json({ ok: true as const, key, punchItems, workers });
    }

    return jsonError("Unknown tab key", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tab data.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

