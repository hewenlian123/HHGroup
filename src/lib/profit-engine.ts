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
  return /column .* does not exist|does not exist.*column/i.test(m);
}

/**
 * Canonical project profit model (single source of truth for revenue/cost/profit):
 *
 * Revenue = base contract + approved change orders
 *   - Base contract = projects.budget (canonical contract value; set on create/convert).
 *   - Approved change orders = project_change_orders where status = 'Approved' (amount or total/total_amount).
 *
 * Actual cost = labor cost + expense cost + subcontract cost
 *   - Labor cost = sum(labor_entries.cost_amount) for this project (locked at entry time).
 *   - Expense cost = sum(expense_lines.amount or total) for this project (direct project expenses).
 *   - Subcontract cost = sum(subcontract_bills.amount) for this project where status = 'Approved'.
 *
 * Legacy note: labor_cost_allocation trigger/RPC (migrations 202603082200/2300/2400) updates projects.spent,
 * but canonical does NOT read projects.spent and therefore those legacy mechanisms do NOT affect canonical cost.
 * Canonical labor cost is always derived from labor_entries.cost_amount (status Approved/Locked), aggregated by project_id.
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
      .select("amount, total")
      .eq("project_id", projectId);
    if (!error && Array.isArray(data)) {
      return (data as Array<{ amount?: unknown; total?: unknown }>).reduce(
        (s, e) => s + toNum(e.amount ?? e.total),
        0
      );
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
    .select("amount, total")
    .eq("project_id", projectId)
    .limit(1);

  if (!error) {
    expenseLinesHasProjectId = true;
    // Re-run without limit for actual result
    const full = await c
      .from("expense_lines")
      .select("amount, total")
      .eq("project_id", projectId);
    if (full.error) { devLogFail("expense_lines (full)", full.error); return 0; }
    return (full.data as Array<{ amount?: unknown; total?: unknown }>).reduce(
      (s, e) => s + toNum(e.amount ?? e.total),
      0
    );
  }

  if (isMissingColumn(error)) {
    expenseLinesHasProjectId = false;
    return getExpenseCostViaJoin(projectId);
  }

  devLogFail("expense_lines (probe)", error);
  return 0;
}

/** Fallback: expense_lines has no project_id — join through expenses table. */
async function getExpenseCostViaJoin(projectId: string): Promise<number> {
  const c = client();
  const { data: expRows, error: expErr } = await c
    .from("expenses")
    .select("id")
    .eq("project_id", projectId);
  if (expErr || !expRows?.length) return 0;
  const expenseIds = (expRows as Array<{ id: string }>).map((r) => r.id);
  const { data: lineRows, error: lineErr } = await c
    .from("expense_lines")
    .select("amount, total")
    .in("expense_id", expenseIds);
  if (lineErr) { devLogFail("expense_lines (join)", lineErr); return 0; }
  return ((lineRows ?? []) as Array<{ amount?: unknown; total?: unknown }>).reduce(
    (s, e) => s + toNum(e.amount ?? e.total),
    0
  );
}

export async function getCanonicalProjectProfit(projectId: string): Promise<CanonicalProjectProfit> {
  const c = client();

  const [projectRes, approvedChangeOrdersRes, laborCostRes, subcontractBillsRes] = await Promise.all([
    c.from("projects").select("budget").eq("id", projectId).single(),
    c.from("project_change_orders").select("*").eq("project_id", projectId).eq("status", "Approved"),
    c.from("labor_entries").select("cost_amount, status").eq("project_id", projectId),
    c.from("subcontract_bills").select("amount").eq("project_id", projectId).eq("status", "Approved"),
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
    approvedCO = (approvedChangeOrdersRes.data as Array<{ amount?: unknown; total?: unknown; total_amount?: unknown }>).reduce(
      (sum, co) => sum + toNum(co?.amount ?? co?.total ?? co?.total_amount),
      0
    );
  } else if (approvedChangeOrdersRes.error) {
    devLogFail("project_change_orders", approvedChangeOrdersRes.error);
  }

  // Labor cost: all entries for this project count (Draft, Submitted, Approved, Locked).
  // Exclude only paid/void if present so "Spent" reflects actual labor cost.
  let laborCost = 0;
  if (!laborCostRes.error && Array.isArray(laborCostRes.data)) {
    const excludeStatus = new Set(["paid", "void"]);
    for (const l of laborCostRes.data as Array<{ cost_amount?: unknown; status?: unknown }>) {
      const s = l?.status != null ? String(l.status) : "";
      if (excludeStatus.has(s.toLowerCase())) continue;
      laborCost += toNum(l?.cost_amount);
    }
  } else if (laborCostRes.error) {
    const msg = laborCostRes.error?.message ?? "";
    if (!/column.*does not exist|does not exist.*column/i.test(msg)) {
      devLogFail("labor_entries.cost_amount", laborCostRes.error);
    }
  }

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

  return { revenue, actualCost, profit, margin, budget: baseContract, approvedChangeOrders: approvedCO, laborCost, expenseCost, subcontractCost };
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

  // 1. Budgets
  const [projectsRes, cosRes, laborRes, subBillsRes] = await Promise.all([
    c.from("projects").select("id, budget").in("id", projectIds),
    c.from("project_change_orders").select("project_id, amount, total, total_amount").in("project_id", projectIds).eq("status", "Approved"),
    c.from("labor_entries").select("project_id, cost_amount, status").in("project_id", projectIds),
    c.from("subcontract_bills").select("project_id, amount").in("project_id", projectIds).eq("status", "Approved"),
  ]);

  // 2. Expense cost — schema-aware bulk fetch
  let expenseByProject = new Map<string, number>();
  expenseByProject = await getExpenseCostBatch(projectIds);

  // Aggregate labor by project (all statuses except paid/void)
  const laborByProject = new Map<string, number>();
  const excludeStatus = new Set(["paid", "void"]);
  if (!laborRes.error && Array.isArray(laborRes.data)) {
    for (const l of laborRes.data as Array<{ project_id?: string; cost_amount?: unknown; status?: unknown }>) {
      const s = l.status != null ? String(l.status).toLowerCase() : "";
      if (excludeStatus.has(s)) continue;
      const pid = l.project_id ?? "";
      laborByProject.set(pid, (laborByProject.get(pid) ?? 0) + toNum(l.cost_amount));
    }
  }

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
    for (const co of cosRes.data as Array<{ project_id?: string; amount?: unknown; total?: unknown; total_amount?: unknown }>) {
      const pid = co.project_id ?? "";
      coByProject.set(pid, (coByProject.get(pid) ?? 0) + toNum(co.amount ?? co.total ?? co.total_amount));
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
    result.set(pid, { revenue, actualCost, profit, margin, budget, approvedChangeOrders, laborCost, expenseCost, subcontractCost });
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
      .select("project_id, amount, total")
      .in("project_id", projectIds);
    if (!error && Array.isArray(data)) {
      for (const e of data as Array<{ project_id?: string; amount?: unknown; total?: unknown }>) {
        const pid = e.project_id ?? "";
        map.set(pid, (map.get(pid) ?? 0) + toNum(e.amount ?? e.total));
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
    .select("project_id, amount, total")
    .in("project_id", projectIds)
    .limit(1);

  if (!error) {
    expenseLinesHasProjectId = true;
    const full = await c.from("expense_lines").select("project_id, amount, total").in("project_id", projectIds);
    if (!full.error && Array.isArray(full.data)) {
      for (const e of full.data as Array<{ project_id?: string; amount?: unknown; total?: unknown }>) {
        const pid = e.project_id ?? "";
        map.set(pid, (map.get(pid) ?? 0) + toNum(e.amount ?? e.total));
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

/** Batch fallback: join expense_lines through expenses. */
async function getExpenseCostBatchViaJoin(projectIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const c = client();

  const { data: expRows, error: expErr } = await c
    .from("expenses")
    .select("id, project_id")
    .in("project_id", projectIds);
  if (expErr || !expRows?.length) return map;

  const expenseProjectMap = new Map<string, string>();
  for (const r of expRows as Array<{ id: string; project_id: string }>) {
    expenseProjectMap.set(r.id, r.project_id);
  }

  const expenseIds = Array.from(expenseProjectMap.keys());
  const { data: lineRows, error: lineErr } = await c
    .from("expense_lines")
    .select("expense_id, amount, total")
    .in("expense_id", expenseIds);
  if (lineErr) { devLogFail("expense_lines batch (join)", lineErr); return map; }

  for (const e of (lineRows ?? []) as Array<{ expense_id?: string; amount?: unknown; total?: unknown }>) {
    const expId = e.expense_id ?? "";
    const pid = expenseProjectMap.get(expId) ?? "";
    if (!pid) continue;
    map.set(pid, (map.get(pid) ?? 0) + toNum(e.amount ?? e.total));
  }
  return map;
}
