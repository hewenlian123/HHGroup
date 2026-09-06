import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancialDataUnavailableError } from "@/lib/financial-availability";

const reads = vi.hoisted(() => ({
  getApBillsSummary: vi.fn(),
  getExpensesThisMonth: vi.fn(),
  getLaborCostThisWeek: vi.fn(),
  getOverdueInvoices: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/data", () => ({
  computeDashboardStatsFromProjects: vi.fn(),
  buildProjectRiskOverview: vi.fn(),
  getApBillsSummary: reads.getApBillsSummary,
  getExpensesThisMonth: reads.getExpensesThisMonth,
  getLaborCostThisWeek: reads.getLaborCostThisWeek,
  getOverdueInvoices: reads.getOverdueInvoices,
  getProjectsDashboard: vi.fn(),
  getRecentTransactions: vi.fn(),
}));

vi.mock("@/lib/profit-engine", () => ({
  getCanonicalProjectProfitBatch: vi.fn(),
}));

vi.mock("@/lib/financial/project-financial-review", () => ({
  getProjectContractReviewSummary: vi.fn(() => ({
    readyProjectIds: [],
    needsReviewProjects: [],
  })),
}));

import {
  getApBillsSummaryCached,
  getExpensesThisMonthCached,
  getLaborCostThisWeekCached,
  getOverdueInvoicesCached,
} from "@/app/dashboard/dashboard-bundle";

const client = {} as SupabaseClient;

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

function exportedFunction(sourceText: string, signature: string): string {
  const start = sourceText.indexOf(signature);
  const next = sourceText.indexOf("\nexport ", start + signature.length);
  return sourceText.slice(start, next === -1 ? undefined : next);
}

describe("dashboard candidate fail-closed reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["permission_denied", { code: "42501", message: "permission denied" }],
    ["schema_failure", { code: "42703", message: "column does not exist" }],
    ["network_failure", new Error("fetch failed")],
  ] as const)("preserves %s instead of manufacturing AP zero totals", async (kind, cause) => {
    const failure = new FinancialDataUnavailableError("AP Bill summary", cause);
    reads.getApBillsSummary.mockRejectedValueOnce(failure);

    await expect(getApBillsSummaryCached(client)).rejects.toMatchObject({
      name: "FinancialDataUnavailableError",
      kind,
      source: "AP Bill summary",
    });
  });

  it("preserves successful financial zeros and true empty invoice results", async () => {
    const apZero = {
      totalOutstanding: 0,
      overdueCount: 0,
      overdueAmount: 0,
      dueThisWeekCount: 0,
      dueThisWeekAmount: 0,
      paidThisMonthAmount: 0,
    };
    reads.getApBillsSummary.mockResolvedValueOnce(apZero);
    reads.getLaborCostThisWeek.mockResolvedValueOnce(0);
    reads.getExpensesThisMonth.mockResolvedValueOnce(0);
    reads.getOverdueInvoices.mockResolvedValueOnce([]);

    await expect(getApBillsSummaryCached(client)).resolves.toEqual(apZero);
    await expect(getLaborCostThisWeekCached(client)).resolves.toBe(0);
    await expect(getExpensesThisMonthCached(client)).resolves.toBe(0);
    await expect(getOverdueInvoicesCached(client)).resolves.toEqual([]);
  });

  it("does not swallow recent-feed, subcontract, or invoice enrichment failures", () => {
    const dataSource = source("src/lib/data/index.ts");
    const recentRead = dataSource.slice(
      dataSource.indexOf("export async function getRecentTransactions("),
      dataSource.indexOf("export async function getExpenseCategories(")
    );
    expect(recentRead).not.toMatch(/\.catch\(\(\)\s*=>\s*\[\]\)/);

    const mainSource = source("src/app/dashboard/dashboard-main-section.tsx");
    expect(mainSource).not.toContain("Subcontract/bills/payments tables may not exist yet");

    const invoiceSource = source("src/lib/invoices-db.ts");
    const overdueRead = invoiceSource.slice(
      invoiceSource.indexOf("export async function getOverdueInvoices("),
      invoiceSource.indexOf("export async function recordInvoicePayment(")
    );
    expect(overdueRead).toContain('financialDataUnavailable("overdue invoice projects"');

    const expenseSource = source("src/lib/expenses-db.ts");
    const recentExpenses = exportedFunction(
      expenseSource,
      "export async function getExpensesRecent("
    );
    expect(recentExpenses).toContain('financialDataUnavailable("recent expenses"');
    expect(recentExpenses).toContain('financialDataUnavailable("recent expense lines"');
    expect(recentExpenses).toContain('financialDataUnavailable("recent expense projects"');

    const laborSource = source("src/lib/daily-labor-db.ts");
    const recentLabor = exportedFunction(
      laborSource,
      "export async function getLaborEntriesRecent("
    );
    expect(recentLabor).toContain('financialDataUnavailable("recent labor entries"');
    expect(recentLabor).toContain('financialDataUnavailable("recent labor projects"');
  });
});
