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
} from "@/lib/data";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";

type TabKey =
  | "overview"
  | "financial"
  | "budget"
  | "expenses"
  | "documents"
  | "activity"
  | "change-orders"
  | "labor"
  | "subcontracts"
  | "bills";

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
      const transactions = await Promise.resolve(getProjectTransactions(id));
      return NextResponse.json({ ok: true as const, key, transactions });
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

    return jsonError("Unknown tab key", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tab data.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}

