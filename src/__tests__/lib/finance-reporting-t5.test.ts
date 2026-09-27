import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { getReportDateRange, getReportsData } from "@/lib/reports-db";
vi.mock("@/lib/supabase-server", () => ({ getServerSupabaseInternalNoStore: vi.fn() }));
const fixture: Record<string, unknown[]> = {
  invoices: [
    {
      id: "invoice",
      total: 100,
      status: "Sent",
      issue_date: "2026-09-01",
      due_date: "2026-09-20",
      project_id: null,
    },
    ...["Draft", "Void", "Legacy", "invalid"].map((status) => ({
      id: status,
      total: 999,
      status,
      issue_date: "2026-09-01",
    })),
  ],
  invoice_payments: [
    {
      id: "payment",
      invoice_id: "invoice",
      amount: 40,
      status: "Recorded",
      payment_date: "2026-09-02",
    },
  ],
  expenses: [
    { id: "expense", total: 999, amount: 999, status: "approved", expense_date: "2026-09-03" },
  ],
  expense_lines: [{ id: "line", expense_id: "expense", amount: 30, project_id: null }],
  ap_bills: [
    {
      id: "bill",
      amount: 20,
      paid_amount: 5,
      balance_amount: 15,
      status: "Partially Paid",
      issue_date: "2026-09-04",
      due_date: "2026-09-21",
    },
  ],
  ap_bill_payments: [{ id: "ap-payment", bill_id: "bill", payment_date: "2026-09-05", amount: 5 }],
  bills: [{ id: "legacy-bill", amount: 777, status: "Approved", issue_date: "2026-09-04" }],
};
function client(denied?: string, rows = fixture) {
  return createClient("http://127.0.0.1:54321", "synthetic", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1)!;
        const all = rows[table] ?? [];
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        return new Response(
          JSON.stringify(
            table === denied
              ? { message: "permission denied", code: "42501" }
              : all.slice(offset, offset + limit)
          ),
          {
            status: table === denied ? 403 : 200,
            headers: { "Content-Type": "application/json", "Content-Range": `0-0/${all.length}` },
          }
        );
      },
    },
  });
}
const range = getReportDateRange({ period: "custom", from: "2026-09-01", to: "2026-09-30" });
beforeEach(() => {
  vi.mocked(getServerSupabaseInternalNoStore).mockReturnValue(client());
});
it("reconciles invoiced 100, collected 40, AR 60, expense lines 30 and AP 15 without legacy duplication", async () => {
  const data = await getReportsData(range);
  const values = Object.fromEntries(data.monthly.kpis.map((k) => [k.key, k.value]));
  expect(values.invoicedRevenue).toBe(100);
  expect(values.cashCollected).toBe(40);
  expect(values.expenses).toBe(30);
  expect(values.paidAp).toBe(5);
  expect(data.arAging.rows.reduce((s, r) => s + r.amount, 0)).toBe(60);
  expect(data.apAging.rows.reduce((s, r) => s + r.amount, 0)).toBe(15);
  expect(data.monthly.kpis.some((k) => k.label === "Net Profit")).toBe(false);
});
it("fails closed when a required financial read is denied", async () => {
  vi.mocked(getServerSupabaseInternalNoStore).mockReturnValue(client("invoices"));
  await expect(getReportsData(range)).rejects.toThrow(/invoices|unavailable/i);
});
it("uses the exact same records for each KPI, including a due-date drilldown", async () => {
  const data = await getReportsData(range, client(), {
    dueFrom: "2026-09-21",
    dueTo: "2026-09-30",
  });
  expect(data.records.outstandingAr).toEqual([]);
  expect(data.records.billsAp.map((r) => r.id)).toEqual(["bill"]);
  for (const kpi of data.monthly.kpis)
    expect(kpi.value).toBeCloseTo(
      data.records[kpi.key].reduce((n, r) => n + r.amount, 0),
      2
    );
});
it("scopes both period activity and current balances by exact project ID", async () => {
  const data = await getReportsData(range, client(), { projectId: "different-project" });
  expect(data.monthly.kpis.every((k) => k.value === 0)).toBe(true);
  expect(data.arAging.rows).toEqual([]);
  expect(data.apAging.rows).toEqual([]);
});
it("keeps empty period activity distinct from current AR and AP snapshots", async () => {
  const future = getReportDateRange({ period: "custom", from: "2100-01-01", to: "2100-01-31" });
  const data = await getReportsData(future);
  expect(data.monthly.hasActivity).toBe(false);
  expect(data.records.outstandingAr[0]?.amount).toBe(60);
  expect(data.records.billsAp[0]?.amount).toBe(15);
});

it("withholds project profit if canonical expense eligibility admits an invalid record", async () => {
  const c = client(undefined, {
    ...fixture,
    projects: [{ id: "project", name: "Synthetic", budget: 100, contract_amount: 100 }],
    expenses: [
      {
        id: "expense",
        status: "Void",
        project_id: "project",
        expense_date: "2026-09-03",
        amount: 30,
        total: 30,
      },
    ],
    expense_lines: [{ id: "line", expense_id: "expense", project_id: "project", amount: 30 }],
  });
  const data = await getReportsData(range, c);
  expect(data.records.projectProfit).toEqual([]);
  expect(data.warnings.join(" ")).toMatch(/expense.*eligibility|eligibility.*expense/i);
});

it("uses explicit invoice customer identity and project customer fallback only for costs", async () => {
  const rows = {
    ...fixture,
    projects: [
      { id: "project", customer_id: "A", name: "Synthetic", budget: 100, contract_amount: 100 },
    ],
    invoices: [
      {
        id: "invoice",
        customer_id: "B",
        project_id: "project",
        status: "Sent",
        total: 100,
        issue_date: "2026-09-01",
      },
    ],
    expense_lines: [{ id: "line", expense_id: "expense", project_id: "project", amount: 30 }],
  };
  const data = await getReportsData(range, client(undefined, rows), { customerId: "A" });
  expect(data.records.invoicedRevenue).toEqual([]);
  expect(data.records.cashCollected).toEqual([]);
  expect(data.arAging.rows).toEqual([]);
  expect(data.records.expenses.reduce((n, r) => n + r.amount, 0)).toBe(30);
});

for (const count of [999, 1000, 1001, 2001]) {
  it(`T6 reads ${count} ledger rows and reconciles every KPI to drilldown`, async () => {
    const rows = Array.from({ length: count }, (_, i) => ({
      id: `invoice-${String(i).padStart(6, "0")}`,
      total: 1,
      status: "Sent",
      issue_date: "2026-09-01",
      project_id: null,
    }));
    const data = await getReportsData(range, client(undefined, { invoices: rows }));
    expect(data.records.invoicedRevenue).toHaveLength(count);
    expect(data.monthly.kpis.find((k) => k.key === "invoicedRevenue")?.value).toBe(count);
    for (const kpi of data.monthly.kpis)
      expect(kpi.value).toBeCloseTo(
        data.records[kpi.key].reduce((n, r) => n + r.amount, 0),
        2
      );
  });
}
it("T6 rejects historical balance requests instead of returning current balances", async () => {
  await expect(getReportsData(range, client(), { asOf: "2026-08-31" })).rejects.toThrow(
    /historical.*unavailable/i
  );
});

it("T6 reads 2001 expense lines, labor and commission rows through canonical dependencies", async () => {
  const many = (type: string) =>
    Array.from({ length: 2001 }, (_, i) => ({
      id: `${type}-${i}`,
      project_id: "project",
      expense_id: "expense",
      amount: 1,
      cost_amount: 1,
      commission_amount: 1,
      status: "Approved",
      work_date: "2026-09-01",
    }));
  const data = await getReportsData(
    range,
    client(undefined, {
      projects: [{ id: "project", name: "Synthetic", budget: 10000, contract_amount: 10000 }],
      expenses: [
        { id: "expense", project_id: "project", status: "approved", expense_date: "2026-09-01" },
      ],
      expense_lines: many("line"),
      labor_entries: many("labor"),
      commissions: many("commission"),
    })
  );
  expect(data.records.expenses).toHaveLength(2001);
  expect(data.records.projectCost[0].amount).toBe(6003);
  expect(data.records.projectProfit[0].amount).toBe(3997);
});
it("T6 retains 100 collected and AP 30 without inventing net cash from expense 20 or worker 10", async () => {
  const data = await getReportsData(
    range,
    client(undefined, {
      invoices: [{ id: "invoice", total: 100, status: "Paid", issue_date: "2026-09-01" }],
      invoice_payments: [
        {
          id: "collected",
          invoice_id: "invoice",
          amount: 100,
          status: "Posted",
          payment_date: "2026-09-02",
        },
        {
          id: "void",
          invoice_id: "invoice",
          amount: 999,
          status: "Voided",
          payment_date: "2026-09-02",
        },
      ],
      ap_bills: [{ id: "bill", amount: 30, paid_amount: 30, status: "Paid" }],
      ap_bill_payments: [{ id: "ap", bill_id: "bill", amount: 30, payment_date: "2026-09-02" }],
      expenses: [
        {
          id: "expense",
          status: "approved",
          payment_account_id: "account",
          expense_date: "2026-09-02",
        },
      ],
      expense_lines: [{ id: "line", expense_id: "expense", amount: 20 }],
      worker_payments: [
        { id: "worker", total_amount: 10, payment_date: "2026-09-02", labor_entry_ids: [] },
      ],
      bank_transactions: [{ id: "transfer", amount: 999, reconcile_type: "transfer" }],
      worker_payment_reversals: [
        {
          payment_id: "old-worker",
          payment_snapshot: { total_amount: 10 },
          reversed_at: "2026-09-03",
        },
      ],
    })
  );
  expect(data.records.cashCollected.reduce((n, r) => n + r.amount, 0)).toBe(100);
  expect(data.records.paidAp.reduce((n, r) => n + r.amount, 0)).toBe(30);
  expect(data.records.expenses.reduce((n, r) => n + r.amount, 0)).toBe(20);
  expect(
    data.monthly.kpis.some((k) => /^(Cash Out|Net Cash Flow|Paid Expenses)$/.test(k.label))
  ).toBe(false);
});
