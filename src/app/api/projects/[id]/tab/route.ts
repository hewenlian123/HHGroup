import { withSessionCookies } from "@/lib/supabase-response";
import { authorizedAppRole } from "@/lib/auth-role";
import { hasCompanyAdministratorMembership } from "@/lib/organization-membership";
import { NextResponse } from "next/server";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
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
  const guard = await requireOrganizationRequestClient(_req, {
    projectId: (await ctx.params).id,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  const supabase = guard.client;

  const { id } = await ctx.params;
  const url = new URL(_req.url);
  const key = (url.searchParams.get("key") ?? "overview").toLowerCase() as TabKey;

  if (!id?.trim())
    return withSessionCookies(jsonError("Missing project id", 400), guard.sessionResponse);
  const operationalKeys = [
    "tasks",
    "schedule",
    "documents",
    "activity",
    "materials",
    "closeout",
    "punch-list",
  ];
  if (
    !operationalKeys.includes(key) &&
    (guard.context.organizationRole === "assistant" ||
      !authorizedAppRole(guard.context.user) ||
      !(await hasCompanyAdministratorMembership(guard.client, guard.context.user).catch(
        () => false
      )))
  )
    return withSessionCookies(jsonError("Financial access required.", 403), guard.sessionResponse);

  try {
    if (key === "financial") {
      const [canonical, billingSummary] = await Promise.all([
        getCanonicalProjectProfit(id, supabase),
        getProjectBillingSummary(id, supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, canonical, billingSummary }),
        guard.sessionResponse
      );
    }

    if (key === "overview") {
      const [transactions, expenseLines] = await Promise.all([
        Promise.resolve(getProjectTransactions(id)),
        getProjectExpenseLines(id, supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({
          ok: true as const,
          key,
          transactions,
          expenseLines,
        }),
        guard.sessionResponse
      );
    }

    if (key === "tasks") {
      const [tasks, workers] = await Promise.all([
        getProjectTasks(id, supabase),
        getWorkers(supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, tasks, workers }),
        guard.sessionResponse
      );
    }

    if (key === "schedule") {
      const schedule = await getProjectSchedule(id, supabase);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, schedule }),
        guard.sessionResponse
      );
    }

    if (key === "budget") {
      const [canonical, billingSummary, sourceFromEstimate] = await Promise.all([
        getCanonicalProjectProfit(id, supabase),
        getProjectBillingSummary(id, supabase),
        getSourceForProject(id, supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({
          ok: true as const,
          key,
          canonical,
          billingSummary,
          sourceFromEstimate,
        }),
        guard.sessionResponse
      );
    }

    if (key === "expenses") {
      const expenseLines = await getProjectExpenseLines(id, supabase);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, expenseLines }),
        guard.sessionResponse
      );
    }

    if (key === "documents") {
      const documents = await getDocumentsByProject(id, supabase);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, documents }),
        guard.sessionResponse
      );
    }

    if (key === "activity") {
      const [transactions, activityLogs] = await Promise.all([
        Promise.resolve(
          guard.context.organizationRole === "assistant" ? [] : getProjectTransactions(id)
        ),
        getActivityLogsByProject(id, 100, supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, transactions, activityLogs }),
        guard.sessionResponse
      );
    }

    if (key === "change-orders") {
      const changeOrders = await getChangeOrdersByProject(id, supabase);
      const response = withSessionCookies(
        NextResponse.json({ ok: true as const, key, changeOrders }),
        guard.sessionResponse
      );

      return response;
    }

    if (key === "labor") {
      const [laborBreakdownRows, laborEntries] = await Promise.all([
        getProjectLaborBreakdown(id, supabase),
        getLaborEntriesWithJoins({ project_id: id }, supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, laborBreakdownRows, laborEntries }),
        guard.sessionResponse
      );
    }

    if (key === "subcontracts") {
      const subcontracts = await getSubcontractsByProject(id, supabase);
      const subcontractIds = subcontracts.map((s) => s.id);
      const [bills, payments] = await Promise.all([
        getBillsBySubcontractIds(subcontractIds, supabase),
        getPaymentsBySubcontractIds(subcontractIds, supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, subcontracts, bills, payments }),
        guard.sessionResponse
      );
    }

    if (key === "bills") {
      const projectBills = await getApBillsByProject(id, supabase);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, projectBills }),
        guard.sessionResponse
      );
    }

    if (key === "materials") {
      const [selections, catalog] = await Promise.all([
        getSelectionsByProject(id, supabase),
        getMaterialCatalog(supabase, guard.context.organizationId ?? undefined),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, selections, catalog }),
        guard.sessionResponse
      );
    }

    if (key === "closeout") {
      const [punch, warranty, completion] = await Promise.all([
        getCloseoutPunch(id, supabase),
        getCloseoutWarranty(id, supabase),
        getCloseoutCompletion(id, supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, punch, warranty, completion }),
        guard.sessionResponse
      );
    }

    if (key === "commission") {
      const commissions = await getCommissionsByProject(id, supabase);
      const response = withSessionCookies(
        NextResponse.json({ ok: true as const, key, commissions }),
        guard.sessionResponse
      );

      return response;
    }

    if (key === "punch-list") {
      const [punchItems, workers] = await Promise.all([
        getPunchListByProject(id, supabase),
        getWorkers(supabase),
      ]);
      return withSessionCookies(
        NextResponse.json({ ok: true as const, key, punchItems, workers }),
        guard.sessionResponse
      );
    }

    return withSessionCookies(jsonError("Unknown tab key", 400), guard.sessionResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tab data.";
    return withSessionCookies(
      NextResponse.json({ ok: false as const, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
