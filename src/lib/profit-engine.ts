import { expenseCountsTowardCanonicalProjectCost } from "@/lib/expense-canonical-cost";
import { getSupabaseClient } from "@/lib/supabase";

export type CanonicalProjectProfit = {
  revenue: number;
  actualCost: number;
  profit: number;
  margin: number;
  /** Budget (base contract) from projects.budget. */
  budget: number;
  /** Sum of approved change order amounts. */
  approvedChangeOrders: number;
  laborCost: number;
  expenseCost: number;
  subcontractCost: number;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

/** Null-safe numeric conversion; returns 0 for null, undefined, or invalid numbers. */
function toNum(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

/** Log a failed query in development only; no-op in production. */
function devLogFail(label: string, err: unknown): void {
  if (isDev && err != null) {
    const msg = (err as { message?: string })?.message ?? String(err);
    // eslint-disable-next-line no-console
    console.warn(`[profit-engine] ${label} failed:`, msg);
  }
}

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|does not exist.*column|could not find the .* column|schema cache|pgrst204/i.test(
    m
  );
}

/**
 * Canonical project profit model (single source of truth for revenue/cost/profit):
 *
 * Revenue = base contract + approved change orders
 *   - Base contract = projects.budget (canonical contract value; set on create/convert).
 *   - Approved change orders = project_change_orders where status = 'Approved' (amount or total/total_amount).
 *
 * Actual cost = labor cost + expense cost + subcontract cost
 *   - Labor cost = sum(labor_entries.cost_amount or total) allocated to this project via project_am_id / project_pm_id
 *     (or legacy project_id when present). Split-day rows share cost 50/50 across two projects when AM ≠ PM.
 *   - Expense cost = sum(expense_lines.amount) for this project (expense_lines.project_id),
 *     plus lines with null project_id on expenses whose header project_id matches (legacy rows).
 *   - Subcontract cost = sum(subcontract_bills.amount) for this project where status = 'Approved'.
 *
 * Legacy note: labor_cost_allocation trigger/RPC (migrations 202603082200/2300/2400) updates projects.spent,
 * but canonical does NOT read projects.spent and therefore those legacy mechanisms do NOT affect canonical cost.
 * Canonical labor cost is derived from labor_entries rows linked to the project (AM/PM columns or legacy project_id).
 *
 * Double-counting rule: expense_lines and subcontract_bills are mutually exclusive by design.
 * - expense_lines = direct project expenses (materials, permits, etc.).
 * - subcontract_bills = obligations to subcontractors (subcontract work).
 * - ap_bills (Bills/AP) are NOT included in project canonical cost.
 *   Bills/AP are for accounts payable + payment tracking, not the canonical project cost model.
 *   Canonical cost sources: labor_entries + expense_lines + subcontract_bills (Approved).
 * Do not enter the same cost in both; if a cost is paid to a subcontractor, use subcontract_bills only.
 *
 * Profit = revenue - actualCost
 * Margin = revenue > 0 ? profit / revenue : 0
 *
 * Defensive: missing columns or failed selects do not crash; missing amounts default to 0.
 */

/**
 * Module-level cache for expense_lines schema detection.
 * null = not yet detected; true = has direct project_id column; false = must join through expenses.
 */
let expenseLinesHasProjectId: boolean | null = null;

/** Filter parent expense headers for canonical cost (excludes inbox upload drafts, etc.). */
async function buildEligibleExpenseIdSetForCost(
  c: ReturnType<typeof client>,
  expenseIds: string[]
): Promise<Set<string> | null> {
  const uniq = [...new Set(expenseIds.filter((id) => id && id.length > 0))];
  if (uniq.length === 0) return new Set();
  const { data, error } = await c
    .from("expenses")
    .select("id, status, reference_no")
    .in("id", uniq);
  if (error || !data) {
    devLogFail("expenses (canonical cost filter)", error);
    return null;
  }
  const out = new Set<string>();
  for (const row of data as Array<{
    id: string;
    status?: string | null;
    reference_no?: string | null;
  }>) {
    if (expenseCountsTowardCanonicalProjectCost(row)) out.add(row.id);
  }
  return out;
}

type LaborCostRow = {
  project_id?: string | null;
  project_am_id?: string | null;
  project_pm_id?: string | null;
  cost_amount?: unknown;
  total?: unknown;
  status?: unknown;
};

const LABOR_EXCLUDE_STATUS = new Set(["paid", "void"]);

function laborLineAmountForProject(row: LaborCostRow, projectId: string): number {
  const full = toNum(row.cost_amount ?? row.total);
  const legacyPid = row.project_id != null ? String(row.project_id) : "";
  if (legacyPid) {
    return legacyPid === projectId ? full : 0;
  }
  const am = row.project_am_id ?? null;
  const pm = row.project_pm_id ?? null;
  if (am === projectId && pm === projectId) return full;
  if (am === projectId && pm && pm !== projectId) return full * 0.5;
  if (pm === projectId && am && am !== projectId) return full * 0.5;
  if (am === projectId && !pm) return full;
  if (pm === projectId && !am) return full;
  return 0;
}

async function fetchLaborCostForProject(projectId: string): Promise<number> {
  const c = client();
  // Prefer project_id (current schema). Many remotes dropped project_am_id / project_pm_id.
  const byProjectId = await c
    .from("labor_entries")
    .select("project_id, cost_amount, total, status")
    .eq("project_id", projectId);

  let rows: LaborCostRow[] = [];
  if (!byProjectId.error && Array.isArray(byProjectId.data)) {
    rows = byProjectId.data as LaborCostRow[];
  } else if (byProjectId.error && isMissingColumn(byProjectId.error)) {
    // No `project_id` on labor_entries (sparse daily labor) — cannot attribute rows to a project here.
    return 0;
  } else if (byProjectId.error) {
    devLogFail("labor_entries", byProjectId.error);
    return 0;
  }

  let sum = 0;
  for (const l of rows) {
    const st = l.status != null ? String(l.status).toLowerCase() : "";
    if (LABOR_EXCLUDE_STATUS.has(st)) continue;
    sum += laborLineAmountForProject(l, projectId);
  }
  return sum;
}

async function fetchLaborCostBatch(projectIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of projectIds) map.set(id, 0);
  const idList = projectIds.filter(Boolean).join(",");
  if (!idList) return map;

  const c = client();
  const byProjectId = await c
    .from("labor_entries")
    .select("project_id, cost_amount, total, status")
    .in("project_id", projectIds);

  let list: LaborCostRow[] = [];
  if (!byProjectId.error && Array.isArray(byProjectId.data)) {
    list = byProjectId.data as LaborCostRow[];
  } else if (byProjectId.error && isMissingColumn(byProjectId.error)) {
    return map;
  } else if (byProjectId.error) {
    devLogFail("labor_entries batch", byProjectId.error);
    return map;
  }

  for (const l of list) {
    const st = l.status != null ? String(l.status).toLowerCase() : "";
    if (LABOR_EXCLUDE_STATUS.has(st)) continue;
    for (const pid of projectIds) {
      const add = laborLineAmountForProject(l, pid);
      if (add !== 0) map.set(pid, (map.get(pid) ?? 0) + add);
    }
  }
  return map;
}

/** Lines with null `project_id` whose expense header is allocated to `projectId` (legacy / partial writes). */
async function getExpenseCostHeaderOnlyLines(projectId: string): Promise<number> {
  const c = client();
  const { data: lines, error } = await c
    .from("expense_lines")
    .select("amount, expense_id, project_id")
    .is("project_id", null);
  if (error || !lines?.length) {
    if (error) devLogFail("expense_lines (header-only orphan probe)", error);
    return 0;
  }
  const expenseIds = [
    ...new Set(
      (lines as Array<{ expense_id?: string }>)
        .map((l) => l.expense_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  if (expenseIds.length === 0) return 0;
  const { data: hdrs, error: hErr } = await c
    .from("expenses")
    .select("id, status, reference_no")
    .in("id", expenseIds)
    .eq("project_id", projectId);
  if (hErr || !hdrs?.length) return 0;
  const allowed = new Set(
    (hdrs as Array<{ id: string; status?: string | null; reference_no?: string | null }>)
      .filter((h) => expenseCountsTowardCanonicalProjectCost(h))
      .map((h) => h.id)
  );
  return (lines as Array<{ expense_id: string; amount?: unknown }>)
    .filter((l) => allowed.has(l.expense_id))
    .reduce((s, l) => s + toNum(l.amount), 0);
}

/**
 * Fetch expense cost for a single project.
 * Detects schema on first call and caches the result for all subsequent calls.
 */
async function getExpenseCostForProject(projectId: string): Promise<number> {
  const c = client();

  // Fast path: already know the schema
  if (expenseLinesHasProjectId === true) {
    const { data, error } = await c
      .from("expense_lines")
      .select("amount, expense_id")
      .eq("project_id", projectId);
    if (!error && Array.isArray(data)) {
      const lineRows = data as Array<{ amount?: unknown; expense_id?: string }>;
      const eids = [
        ...new Set(
          lineRows.map((r) => r.expense_id).filter((id): id is string => typeof id === "string")
        ),
      ];
      const eligible = await buildEligibleExpenseIdSetForCost(c, eids);
      const allow = eligible ?? new Set(eids);
      const direct = lineRows.reduce((s, row) => {
        const eid = row.expense_id ?? "";
        if (!eid || !allow.has(eid)) return s;
        return s + toNum(row.amount);
      }, 0);
      const headerOnly = await getExpenseCostHeaderOnlyLines(projectId);
      return direct + headerOnly;
    }
    devLogFail("expense_lines (direct)", error);
    return 0;
  }

  if (expenseLinesHasProjectId === false) {
    return getExpenseCostViaJoin(projectId);
  }

  // Schema unknown — probe it
  const { error } = await c
    .from("expense_lines")
    .select("amount")
    .eq("project_id", projectId)
    .limit(1);

  if (!error) {
    expenseLinesHasProjectId = true;
    const full = await c
      .from("expense_lines")
      .select("amount, expense_id")
      .eq("project_id", projectId);
    if (full.error) {
      devLogFail("expense_lines (full)", full.error);
      return 0;
    }
    const lineRows = (full.data ?? []) as Array<{ amount?: unknown; expense_id?: string }>;
    const eids = [
      ...new Set(
        lineRows.map((r) => r.expense_id).filter((id): id is string => typeof id === "string")
      ),
    ];
    const eligible = await buildEligibleExpenseIdSetForCost(c, eids);
    const allow = eligible ?? new Set(eids);
    const direct = lineRows.reduce((s, row) => {
      const eid = row.expense_id ?? "";
      if (!eid || !allow.has(eid)) return s;
      return s + toNum(row.amount);
    }, 0);
    const headerOnly = await getExpenseCostHeaderOnlyLines(projectId);
    return direct + headerOnly;
  }

  if (isMissingColumn(error)) {
    expenseLinesHasProjectId = false;
    return getExpenseCostViaJoin(projectId);
  }

  devLogFail("expense_lines (probe)", error);
  return 0;
}

/**
 * Fallback when `expense_lines.project_id` is missing from the PostgREST schema cache
 * or the column does not exist: sum line amounts for expenses whose header `project_id` matches.
 */
async function getExpenseCostViaJoin(projectId: string): Promise<number> {
  const c = client();
  const { data: headers, error: e1 } = await c
    .from("expenses")
    .select("id, status, reference_no")
    .eq("project_id", projectId);
  if (e1) {
    if (isMissingColumn(e1)) return 0;
    devLogFail("expenses (join path)", e1);
    return 0;
  }
  const ids = (headers ?? [])
    .filter((h: { id?: string; status?: string | null; reference_no?: string | null }) =>
      expenseCountsTowardCanonicalProjectCost(
        h as { status?: string | null; reference_no?: string | null }
      )
    )
    .map((h: { id?: string }) => h.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return 0;

  const { data: lines, error: e2 } = await c
    .from("expense_lines")
    .select("amount")
    .in("expense_id", ids);
  if (e2) {
    devLogFail("expense_lines (join path)", e2);
    return 0;
  }
  return (
    (lines as Array<{ amount?: unknown }> | null)?.reduce((s, row) => s + toNum(row.amount), 0) ?? 0
  );
}

export async function getCanonicalProjectProfit(
  projectId: string
): Promise<CanonicalProjectProfit> {
  const c = client();

  const [projectRes, approvedChangeOrdersRes, subcontractBillsRes] = await Promise.all([
    c.from("projects").select("budget").eq("id", projectId).single(),
    c
      .from("project_change_orders")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "Approved"),
    c
      .from("subcontract_bills")
      .select("amount")
      .eq("project_id", projectId)
      .eq("status", "Approved"),
  ]);

  // Base contract
  let baseContract = 0;
  if (!projectRes.error && projectRes.data != null) {
    baseContract = toNum((projectRes.data as { budget?: number | null })?.budget);
  } else if (projectRes.error) {
    devLogFail("projects.budget", projectRes.error);
  }

  // Approved change orders
  let approvedCO = 0;
  if (!approvedChangeOrdersRes.error && Array.isArray(approvedChangeOrdersRes.data)) {
    approvedCO = (
      approvedChangeOrdersRes.data as Array<{
        amount?: unknown;
        total?: unknown;
        total_amount?: unknown;
      }>
    ).reduce((sum, co) => sum + toNum(co?.amount ?? co?.total ?? co?.total_amount), 0);
  } else if (approvedChangeOrdersRes.error) {
    devLogFail("project_change_orders", approvedChangeOrdersRes.error);
  }

  const laborCost = await fetchLaborCostForProject(projectId);

  // Expense cost via schema-aware helper (caches detection)
  const expenseCost = await getExpenseCostForProject(projectId);

  // Subcontract cost
  let subcontractCost = 0;
  if (!subcontractBillsRes.error && Array.isArray(subcontractBillsRes.data)) {
    subcontractCost = (subcontractBillsRes.data as Array<{ amount?: unknown }>).reduce(
      (sum, s) => sum + toNum(s?.amount),
      0
    );
  } else if (subcontractBillsRes.error) {
    devLogFail("subcontract_bills", subcontractBillsRes.error);
  }

  const revenue = baseContract + approvedCO;
  const actualCost = laborCost + expenseCost + subcontractCost;
  const profit = revenue - actualCost;
  const margin = revenue > 0 ? profit / revenue : 0;

  return {
    revenue,
    actualCost,
    profit,
    margin,
    budget: baseContract,
    approvedChangeOrders: approvedCO,
    laborCost,
    expenseCost,
    subcontractCost,
  };
}

/**
 * Batch version: computes canonical profit for multiple projects in 5 bulk queries instead of 5×N.
 * Use this for dashboard / list pages that need financials for many projects at once.
 */
export async function getCanonicalProjectProfitBatch(
  projectIds: string[]
): Promise<Map<string, CanonicalProjectProfit>> {
  const result = new Map<string, CanonicalProjectProfit>();
  if (projectIds.length === 0) return result;

  const c = client();

  // 1. Budgets + non-labor cost sources
  const [projectsRes, cosRes, subBillsRes, expenseByProject, laborByProject] = await Promise.all([
    c.from("projects").select("id, budget").in("id", projectIds),
    c
      .from("project_change_orders")
      .select("project_id, amount, total, total_amount")
      .in("project_id", projectIds)
      .eq("status", "Approved"),
    c
      .from("subcontract_bills")
      .select("project_id, amount")
      .in("project_id", projectIds)
      .eq("status", "Approved"),
    getExpenseCostBatch(projectIds),
    fetchLaborCostBatch(projectIds),
  ]);

  // Aggregate subcontract cost by project
  const subByProject = new Map<string, number>();
  if (!subBillsRes.error && Array.isArray(subBillsRes.data)) {
    for (const s of subBillsRes.data as Array<{ project_id?: string; amount?: unknown }>) {
      const pid = s.project_id ?? "";
      subByProject.set(pid, (subByProject.get(pid) ?? 0) + toNum(s.amount));
    }
  }

  // Aggregate approved change orders by project
  const coByProject = new Map<string, number>();
  if (!cosRes.error && Array.isArray(cosRes.data)) {
    for (const co of cosRes.data as Array<{
      project_id?: string;
      amount?: unknown;
      total?: unknown;
      total_amount?: unknown;
    }>) {
      const pid = co.project_id ?? "";
      coByProject.set(
        pid,
        (coByProject.get(pid) ?? 0) + toNum(co.amount ?? co.total ?? co.total_amount)
      );
    }
  }

  // Build result map
  const budgetMap = new Map<string, number>();
  if (!projectsRes.error && Array.isArray(projectsRes.data)) {
    for (const p of projectsRes.data as Array<{ id: string; budget?: unknown }>) {
      budgetMap.set(p.id, toNum(p.budget));
    }
  }

  for (const pid of projectIds) {
    const budget = budgetMap.get(pid) ?? 0;
    const approvedChangeOrders = coByProject.get(pid) ?? 0;
    const laborCost = laborByProject.get(pid) ?? 0;
    const expenseCost = expenseByProject.get(pid) ?? 0;
    const subcontractCost = subByProject.get(pid) ?? 0;
    const revenue = budget + approvedChangeOrders;
    const actualCost = laborCost + expenseCost + subcontractCost;
    const profit = revenue - actualCost;
    const margin = revenue > 0 ? profit / revenue : 0;
    result.set(pid, {
      revenue,
      actualCost,
      profit,
      margin,
      budget,
      approvedChangeOrders,
      laborCost,
      expenseCost,
      subcontractCost,
    });
  }

  return result;
}

/** Batch expense cost lookup, schema-aware. */
async function getExpenseCostBatch(projectIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (projectIds.length === 0) return map;
  const c = client();

  // Fast path: already know the schema
  if (expenseLinesHasProjectId === true) {
    const { data, error } = await c
      .from("expense_lines")
      .select("project_id, amount, expense_id")
      .in("project_id", projectIds);
    if (!error && Array.isArray(data)) {
      const rows = data as Array<{ project_id?: string; amount?: unknown; expense_id?: string }>;
      const eids = [...new Set(rows.map((r) => r.expense_id).filter((id): id is string => !!id))];
      const eligible = await buildEligibleExpenseIdSetForCost(c, eids);
      const allow = eligible ?? new Set(eids);
      for (const e of rows) {
        const eid = e.expense_id ?? "";
        if (!eid || !allow.has(eid)) continue;
        const pid = e.project_id ?? "";
        map.set(pid, (map.get(pid) ?? 0) + toNum(e.amount));
      }
    }
    return map;
  }

  if (expenseLinesHasProjectId === false) {
    return getExpenseCostBatchViaJoin(projectIds);
  }

  // Probe
  const { error } = await c
    .from("expense_lines")
    .select("project_id, amount")
    .in("project_id", projectIds)
    .limit(1);

  if (!error) {
    expenseLinesHasProjectId = true;
    const full = await c
      .from("expense_lines")
      .select("project_id, amount, expense_id")
      .in("project_id", projectIds);
    if (!full.error && Array.isArray(full.data)) {
      const rows = full.data as Array<{
        project_id?: string;
        amount?: unknown;
        expense_id?: string;
      }>;
      const eids = [...new Set(rows.map((r) => r.expense_id).filter((id): id is string => !!id))];
      const eligible = await buildEligibleExpenseIdSetForCost(c, eids);
      const allow = eligible ?? new Set(eids);
      for (const e of rows) {
        const eid = e.expense_id ?? "";
        if (!eid || !allow.has(eid)) continue;
        const pid = e.project_id ?? "";
        map.set(pid, (map.get(pid) ?? 0) + toNum(e.amount));
      }
    }
    return map;
  }

  if (isMissingColumn(error)) {
    expenseLinesHasProjectId = false;
    return getExpenseCostBatchViaJoin(projectIds);
  }

  devLogFail("expense_lines batch (probe)", error);
  return map;
}

/** Batch fallback when expense_lines.project_id is unavailable (see getExpenseCostViaJoin). */
async function getExpenseCostBatchViaJoin(projectIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of projectIds) map.set(id, 0);
  if (projectIds.length === 0) return map;

  const c = client();
  const { data: headers, error } = await c
    .from("expenses")
    .select("id, project_id, status, reference_no")
    .in("project_id", projectIds);
  if (error) {
    if (isMissingColumn(error)) return map;
    devLogFail("expenses batch (join path)", error);
    return map;
  }
  const byExpense = new Map<string, string>();
  const expenseIds: string[] = [];
  for (const h of headers ?? []) {
    const row = h as {
      id?: string;
      project_id?: string | null;
      status?: string | null;
      reference_no?: string | null;
    };
    const eid = row.id != null ? String(row.id) : "";
    const pid = row.project_id != null ? String(row.project_id) : "";
    if (!eid || !pid || !map.has(pid)) continue;
    if (!expenseCountsTowardCanonicalProjectCost(row)) continue;
    byExpense.set(eid, pid);
    expenseIds.push(eid);
  }
  if (expenseIds.length === 0) return map;

  const { data: lines, error: le } = await c
    .from("expense_lines")
    .select("expense_id, amount")
    .in("expense_id", expenseIds);
  if (le || !lines) {
    devLogFail("expense_lines batch (join path)", le);
    return map;
  }
  for (const row of lines as Array<{ expense_id?: string; amount?: unknown }>) {
    const eid = row.expense_id != null ? String(row.expense_id) : "";
    const pid = byExpense.get(eid);
    if (!pid) continue;
    map.set(pid, (map.get(pid) ?? 0) + toNum(row.amount));
  }
  return map;
}
