import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
let results: Record<string, Record<string, string>>;
beforeAll(() => {
  results = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--eval",
        `
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    let mode = 'empty';
    const mock = (name, exports) => { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; };
    mock('next/navigation', { useRouter: () => ({ refresh() {} }), useSearchParams: () => new URLSearchParams() });
    mock('./src/lib/auth-boundary.ts', { requireSupabaseOwnerOrAdminServerActionClient: async () => mode === 'denied' ? { ok: false, error: 'Permission denied' } : { ok: true, client: { session: 'fixture' } } });
    const read = (value) => async (client) => { if (mode === 'error') throw Error('unavailable'); if (!client?.session) throw Error('session missing'); return value; };
    mock('./src/lib/reports-db.ts', { getReportDateRange: () => ({}), getReportsData: async (range, client) => read({monthly:{kpis:[{key:'invoicedRevenue',label:'Invoiced Revenue',value:0}]}})(client) });
    mock('./src/lib/data/index.ts', {
      getTotalLaborCost: read(0),
      getCompanyFinancialDashboard: read({ budget: 0, spent: 0, revenue: 0, collected: 0, profit: 0, cashflow: 0 }),
      getFinanceOverviewStats: read({ revenue: 0, totalBills: 0, totalExpenses: 0, totalLaborCost: 0, profit: 0 }),
      getRecentTransactions: async (limit, client) => read([])(client),
      getCashOverview: read({ bankBalance: 0, reconciledBankTotal: 0, unreconciledBankTotal: 0, recentUnreconciled: [] }),
      getDeposits: read([]),
    });
    const paths = { labor: './src/app/finance/labor-cost/page.tsx', dashboard: './src/app/financial/dashboard/page.tsx', overview: './src/app/financial/page.tsx', accounts: './src/app/financial/accounts/overview/page.tsx' };
    (async () => {
      const output = {};
      for (const [name,path] of Object.entries(paths)) {
        const Page = require(path).default; output[name] = {};
        for (const state of ['empty','error','denied']) { mode = state; output[name][state] = renderToStaticMarkup(await Page({})); }
      }
      process.stdout.write(JSON.stringify(output));
    })().catch(e => { console.error(e); process.exit(1); });
  `,
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    )
  );
});
describe("Finance Phase 3 server display semantics", () => {
  for (const route of ["labor", "dashboard", "overview", "accounts"]) {
    it(`${route}: successful empty is zero, error/denial never is`, () => {
      expect(results[route].empty).toContain("$0.00");
      expect(results[route].error).toContain("unavailable");
      expect(results[route].error).toContain("Try again");
      expect(results[route].error).not.toContain("$0.00");
      expect(results[route].denied).toContain("Permission");
      expect(results[route].denied).not.toContain("$0.00");
    });
  }
});
