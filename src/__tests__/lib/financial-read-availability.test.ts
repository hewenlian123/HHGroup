import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getTotalDepositsAmount } from "@/lib/deposits-db";
import { getApBillPayments } from "@/lib/ap-bills-db";
import {
  getExpenseById,
  getExpenseTotalsByProject,
  getProjectExpenseLines,
  getProjectExpenseLinesBundle,
  getTotalExpenses,
} from "@/lib/expenses-db";
import { FinancialDataUnavailableError } from "@/lib/financial-availability";
import { getInvoices, getPaymentsByInvoiceId } from "@/lib/invoices-db";
import { getLaborPayments } from "@/lib/labor-db";

type QueryResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

function scriptedClient(responses: Record<string, QueryResult[]>): SupabaseClient {
  const queues = Object.fromEntries(
    Object.entries(responses).map(([table, results]) => [table, [...results]])
  ) as Record<string, QueryResult[]>;

  return {
    from(table: string) {
      const next = () =>
        Promise.resolve(
          queues[table]?.shift() ?? ({ data: [], error: null } satisfies QueryResult)
        );
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "gte", "lte", "not", "limit"]) {
        builder[method] = () => builder;
      }
      builder.maybeSingle = next;
      builder.single = next;
      builder.then = (
        resolve: (value: QueryResult) => unknown,
        reject: (reason: unknown) => unknown
      ) => next().then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient;
}

async function expectAvailability(
  promise: Promise<unknown>,
  expected: Pick<FinancialDataUnavailableError, "kind" | "source">
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected financial data to be unavailable.");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancialDataUnavailableError);
    expect(error).toMatchObject(expected);
  }
}

const projectExpenseLine = {
  id: "line-1",
  expense_id: "expense-1",
  project_id: "project-1",
  category: "Materials",
  cost_code: "MAT",
  description: "Lumber",
  amount: 125,
};

const expenseHeader = {
  id: "expense-1",
  expense_date: "2026-08-01",
  vendor: "Supplier",
  vendor_name: "Supplier",
  notes: null,
  payment_method: "Card",
  reference_no: null,
  total: 125,
  line_count: 1,
  receipt_url: null,
  status: "approved",
  worker_id: null,
  card_name: null,
  account_id: null,
  payment_account_id: null,
  project_id: "project-1",
  created_at: "2026-08-01T00:00:00.000Z",
};

const invoiceHeader = {
  id: "invoice-1",
  project_id: "project-1",
  customer_id: null,
  invoice_no: "INV-001",
  client_name: "Customer",
  issue_date: "2026-08-01",
  due_date: "2026-09-01",
  status: "Draft",
  total: 110,
  subtotal: 100,
  tax_pct: 10,
  tax_amount: 10,
  notes: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

function deniedClient(tableName: string): SupabaseClient {
  return {
    from(table: string) {
      if (table !== tableName) throw new Error(`Unexpected table: ${table}`);
      const result = Promise.resolve({
        data: null,
        error: { code: "42501", message: `permission denied for table ${table}` },
      });
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: result.then.bind(result),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("typed financial read availability", () => {
  it("does not turn a deposits permission failure into a real zero", async () => {
    await expect(getTotalDepositsAmount(deniedClient("deposits"))).rejects.toThrow(
      "permission denied for table deposits"
    );
  });

  it("does not turn an expenses permission failure into a real zero", async () => {
    await expect(getTotalExpenses(deniedClient("expenses"))).rejects.toThrow(
      "permission denied for table expenses"
    );
  });

  it("does not turn a project expense-line failure into a real zero", async () => {
    await expect(
      getExpenseTotalsByProject("project-1", deniedClient("expense_lines"))
    ).rejects.toThrow("permission denied for table expense_lines");
  });

  it("does not turn a labor-payments permission failure into a true empty list", async () => {
    await expect(getLaborPayments(undefined, deniedClient("labor_payments"))).rejects.toThrow(
      "permission denied for table labor_payments"
    );
  });

  it("does not turn an invoice-payment permission failure into a true empty list", async () => {
    await expect(
      getPaymentsByInvoiceId("invoice-1", deniedClient("invoice_payments"))
    ).rejects.toThrow("permission denied for table invoice_payments");
  });

  it("does not turn an AP-payment permission failure into a true empty list", async () => {
    await expect(getApBillPayments("bill-1", deniedClient("ap_bill_payments"))).rejects.toThrow(
      "permission denied for table ap_bill_payments"
    );
  });

  it.each([
    ["permission_denied", { code: "42501", message: "permission denied for expense lines" }],
    ["schema_failure", { code: "42P01", message: "relation expense_lines does not exist" }],
    ["network_failure", { message: "fetch failed while loading expense lines" }],
  ] as const)(
    "classifies a project expense-line %s instead of returning an empty list",
    async (kind, lineError) => {
      await expectAvailability(
        getProjectExpenseLines(
          "project-1",
          scriptedClient({ expense_lines: [{ data: null, error: lineError }] })
        ),
        { kind, source: "project expense lines" }
      );
    }
  );

  it("does not turn a null project expense-line source into an empty list", async () => {
    await expectAvailability(
      getProjectExpenseLines(
        "project-1",
        scriptedClient({ expense_lines: [{ data: null, error: null }] })
      ),
      { kind: "unavailable_source", source: "project expense lines" }
    );
  });

  it("preserves a successful empty project expense-line result", async () => {
    await expect(
      getProjectExpenseLines(
        "project-1",
        scriptedClient({ expense_lines: [{ data: [], error: null }] })
      )
    ).resolves.toEqual([]);
  });

  it("does not silently skip a project expense line when its header is denied", async () => {
    await expectAvailability(
      getProjectExpenseLines(
        "project-1",
        scriptedClient({
          expense_lines: [{ data: [projectExpenseLine], error: null }],
          expenses: [
            {
              data: null,
              error: { code: "42501", message: "permission denied for table expenses" },
            },
          ],
        })
      ),
      { kind: "permission_denied", source: "project expense headers" }
    );
  });

  it("does not accept an invalid project expense-line association", async () => {
    await expectAvailability(
      getProjectExpenseLines(
        "project-1",
        scriptedClient({
          expense_lines: [{ data: [{ ...projectExpenseLine, expense_id: null }], error: null }],
        })
      ),
      { kind: "unavailable_source", source: "project expense lines" }
    );
  });

  it("does not silently skip a project expense line whose referenced header is unavailable", async () => {
    await expectAvailability(
      getProjectExpenseLines(
        "project-1",
        scriptedClient({
          expense_lines: [{ data: [projectExpenseLine], error: null }],
          expenses: [{ data: [], error: null }],
        })
      ),
      { kind: "unavailable_source", source: "project expense headers" }
    );
  });

  it("does not turn denied expense detail lines into a header-only expense", async () => {
    await expectAvailability(
      getExpenseById(
        "expense-1",
        scriptedClient({
          expenses: [{ data: expenseHeader, error: null }],
          expense_lines: [
            {
              data: null,
              error: { code: "42501", message: "permission denied for table expense_lines" },
            },
          ],
        })
      ),
      { kind: "permission_denied", source: "expense lines" }
    );
  });

  it("does not turn null expense detail lines into a header-only expense", async () => {
    await expectAvailability(
      getExpenseById(
        "expense-1",
        scriptedClient({
          expenses: [{ data: expenseHeader, error: null }],
          expense_lines: [{ data: null, error: null }],
        })
      ),
      { kind: "unavailable_source", source: "expense lines" }
    );
  });

  it("fails closed when an expense-header schema fallback encounters a network failure", async () => {
    await expectAvailability(
      getExpenseById(
        "expense-1",
        scriptedClient({
          expenses: [
            {
              data: null,
              error: {
                code: "PGRST204",
                message:
                  "Could not find the 'source_type' column of 'expenses' in the schema cache",
              },
            },
            { data: null, error: { message: "fetch failed while loading expense header" } },
          ],
        })
      ),
      { kind: "network_failure", source: "expense header" }
    );
  });

  it("preserves a successful expense not-found result", async () => {
    await expect(
      getExpenseById("missing-expense", scriptedClient({ expenses: [{ data: null, error: null }] }))
    ).resolves.toBeNull();
  });

  it("preserves a successful expense-header compatibility fallback and exact detail amount", async () => {
    const missingColumn = {
      code: "PGRST204",
      message: "Could not find the 'source_type' column of 'expenses' in the schema cache",
    };
    await expect(
      getExpenseById(
        "expense-1",
        scriptedClient({
          expenses: [
            { data: null, error: missingColumn },
            { data: expenseHeader, error: null },
          ],
          expense_lines: [{ data: [projectExpenseLine], error: null }],
        })
      )
    ).resolves.toMatchObject({
      id: "expense-1",
      date: "2026-08-01",
      vendorName: "Supplier",
      lines: [{ id: "line-1", projectId: "project-1", amount: 125 }],
    });
  });

  it("does not turn null project-cost expense lines into an empty dashboard bundle", async () => {
    await expectAvailability(
      getProjectExpenseLinesBundle(
        "project-1",
        scriptedClient({ expense_lines: [{ data: null, error: null }] })
      ),
      { kind: "unavailable_source", source: "project expense lines" }
    );
  });

  it("does not turn null project expense totals into a real zero", async () => {
    await expectAvailability(
      getExpenseTotalsByProject(
        "project-1",
        scriptedClient({ expense_lines: [{ data: null, error: null }] })
      ),
      { kind: "unavailable_source", source: "project expense lines" }
    );
  });

  it("preserves zero for a successful empty project expense-line result", async () => {
    await expect(
      getExpenseTotalsByProject(
        "project-1",
        scriptedClient({ expense_lines: [{ data: [], error: null }] })
      )
    ).resolves.toBe(0);
  });

  it.each([
    ["schema_failure", { code: "42P01", message: "relation invoice_items does not exist" }],
    ["permission_denied", { code: "42501", message: "permission denied for table invoice_items" }],
    ["network_failure", { message: "fetch failed while loading invoice_items" }],
  ] as const)(
    "classifies a bulk invoice-item %s instead of returning header-only invoices",
    async (kind, itemError) => {
      await expectAvailability(
        getInvoices(
          scriptedClient({
            invoices: [{ data: [invoiceHeader], error: null }],
            invoice_items: [{ data: null, error: itemError }],
          })
        ),
        { kind, source: "invoice items" }
      );
    }
  );

  it("does not turn null bulk invoice-item data into header-only invoices", async () => {
    await expectAvailability(
      getInvoices(
        scriptedClient({
          invoices: [{ data: [invoiceHeader], error: null }],
          invoice_items: [{ data: null, error: null }],
        })
      ),
      { kind: "unavailable_source", source: "invoice items" }
    );
  });

  it("does not accept an invalid bulk invoice-item association", async () => {
    await expectAvailability(
      getInvoices(
        scriptedClient({
          invoices: [{ data: [invoiceHeader], error: null }],
          invoice_items: [
            {
              data: [
                {
                  id: "item-1",
                  invoice_id: null,
                  description: "Work",
                  quantity: 1,
                  unit_price: 100,
                  amount: 100,
                },
              ],
              error: null,
            },
          ],
        })
      ),
      { kind: "unavailable_source", source: "invoice items" }
    );
  });

  it("preserves the nullable legacy amount fallback and exact item-derived formula", async () => {
    await expect(
      getInvoices(
        scriptedClient({
          invoices: [{ data: [invoiceHeader], error: null }],
          invoice_items: [
            {
              data: [
                {
                  id: "item-1",
                  invoice_id: "invoice-1",
                  description: "Legacy Work",
                  quantity: 2,
                  unit_price: 50,
                  amount: null,
                },
              ],
              error: null,
            },
          ],
        })
      )
    ).resolves.toMatchObject([
      {
        id: "invoice-1",
        lineItems: [{ qty: 2, unitPrice: 50, amount: 100 }],
        subtotal: 100,
        taxAmount: 10,
        total: 110,
      },
    ]);
  });

  it("does not convert a nonnumeric bulk invoice-item amount into a real zero", async () => {
    await expectAvailability(
      getInvoices(
        scriptedClient({
          invoices: [{ data: [invoiceHeader], error: null }],
          invoice_items: [
            {
              data: [
                {
                  id: "item-1",
                  invoice_id: "invoice-1",
                  description: "Work",
                  quantity: 1,
                  unit_price: 100,
                  amount: "not-a-number",
                },
              ],
              error: null,
            },
          ],
        })
      ),
      { kind: "unavailable_source", source: "invoice items" }
    );
  });

  it("preserves successful empty bulk invoice items and stored invoice amounts", async () => {
    await expect(
      getInvoices(
        scriptedClient({
          invoices: [{ data: [invoiceHeader], error: null }],
          invoice_items: [{ data: [], error: null }],
        })
      )
    ).resolves.toMatchObject([
      { id: "invoice-1", lineItems: [], subtotal: 100, taxAmount: 10, total: 110 },
    ]);
  });

  it("preserves item-derived invoice formulas when valid bulk items load", async () => {
    await expect(
      getInvoices(
        scriptedClient({
          invoices: [
            {
              data: [{ ...invoiceHeader, subtotal: 999, tax_amount: 99.9, total: 1098.9 }],
              error: null,
            },
          ],
          invoice_items: [
            {
              data: [
                {
                  id: "item-1",
                  invoice_id: "invoice-1",
                  description: "Work",
                  quantity: 2,
                  unit_price: 50,
                  amount: 100,
                },
              ],
              error: null,
            },
          ],
        })
      )
    ).resolves.toMatchObject([
      {
        id: "invoice-1",
        lineItems: [{ qty: 2, unitPrice: 50, amount: 100 }],
        subtotal: 100,
        taxAmount: 10,
        total: 110,
      },
    ]);
  });
});
