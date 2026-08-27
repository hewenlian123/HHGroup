import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
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
  getActivityLogsByProject,
  getCloseoutWarranty,
  getCloseoutCompletion,
  getCommissionsByProject,
} from "@/lib/data";
import { getApBillsByProject } from "@/lib/ap-bills-db";
import { createRouteSupabaseClient, getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";

type TabKey =
  | "overview"
  | "financial"
  | "budget"
  | "expenses"
  | "change-orders"
  | "labor"
  | "subcontracts"
  | "bills"
  | "documents"
  | "activity"
  | "closeout"
  | "commission";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false as const, message }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(_req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const url = new URL(_req.url);
  const key = (url.searchParams.get("key") ?? "overview").toLowerCase() as TabKey;

  if (!id?.trim()) return jsonError("Missing project id", 400);

  try {
    if (key === "financial") {
      const supabase = getServerSupabaseInternalNoStore();
      if (!supabase) return jsonError("Supabase is not configured.", 503);
      const [canonical, billingSummary] = await Promise.all([
        getCanonicalProjectProfit(id, supabase),
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
      const supabase = getServerSupabaseInternalNoStore();
      if (!supabase) return jsonError("Supabase is not configured.", 503);
      const [canonical, billingSummary, sourceFromEstimate] = await Promise.all([
        getCanonicalProjectProfit(id, supabase),
        getProjectBillingSummary(id),
        getSourceForProject(id),
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
      const sessionResponse = NextResponse.next();
      const supabase = createRouteSupabaseClient(_req, sessionResponse, { noStore: true });
      if (!supabase) return jsonError("Authenticated project session is not configured.", 503);
      const changeOrders = await getChangeOrdersByProject(id, supabase);
      const response = NextResponse.json({ ok: true as const, key, changeOrders });
      for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
      return response;
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
      const supabase = getServerSupabaseInternalNoStore();
      const projectBills = supabase ? await getApBillsByProject(id, supabase).catch(() => []) : [];
      return NextResponse.json({ ok: true as const, key, projectBills });
    }

    if (key === "closeout") {
      const [warranty, completion] = await Promise.all([
        getCloseoutWarranty(id).catch(() => null),
        getCloseoutCompletion(id).catch(() => null),
      ]);
      return NextResponse.json({ ok: true as const, key, warranty, completion });
    }

    if (key === "commission") {
      const commissions = await getCommissionsByProject(id);
      return NextResponse.json({ ok: true as const, key, commissions });
    }

    return jsonError("Unknown tab key", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tab data.";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }
}
