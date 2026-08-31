import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => runtime.client,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => runtime.client,
}));

vi.mock("@/lib/expense-options-db", () => ({
  defaultPaymentMethodName: async () => "ACH",
  publicSchemaItemAvailable: async () => true,
}));

vi.mock("@/lib/subcontract-deductions-db", () => ({
  getSubcontractDeductionsByExpenseIds: async () => new Map(),
  replaceSubcontractDeductionForExpense: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  runtime.client = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-only";
});

describe("financial data-layer atomicity failure injection", () => {
  it("fails closed before RPC when an Expense create omits its idempotency key", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "atomic RPC must not run without an idempotency key" },
    }));
    runtime.client = { rpc };

    const { createExpense } = await import("@/lib/expenses-db");
    await expect(
      createExpense({
        date: "2026-08-29",
        vendorName: "Missing Key Vendor",
        lines: [{ projectId: "project-1", category: "Materials", amount: 100 }],
      } as unknown as Parameters<typeof createExpense>[0])
    ).rejects.toThrow("Expense idempotency key is required.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rolls back Payment Received and its trigger-created deposit when allocation fails", async () => {
    const state = {
      payments: [] as Array<Record<string, unknown>>,
      deposits: [] as Array<Record<string, unknown>>,
      allocations: [] as Array<Record<string, unknown>>,
    };
    const paymentRow = {
      id: "payment-1",
      invoice_id: "invoice-1",
      project_id: "project-1",
      customer_name: "Customer One",
      payment_date: "2026-08-29",
      amount: 100,
      payment_method: "ACH",
      deposit_account: "Operating",
      notes: null,
      attachment_url: null,
      status: "completed",
      created_at: "2026-08-29T00:00:00.000Z",
    };

    const fake = {
      async rpc(name: string) {
        expect(name).toBe("record_payment_received_atomic");
        return { data: null, error: { message: "injected invoice allocation failure" } };
      },
      from(table: string) {
        if (table === "invoices") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: { id: "invoice-1", total: 500, status: "Sent" }, error: null };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "payments_received") {
          return {
            insert(row: Record<string, unknown>) {
              state.payments.push(row);
              state.deposits.push({
                id: "deposit-1",
                payment_id: paymentRow.id,
                invoice_id: paymentRow.invoice_id,
                amount: paymentRow.amount,
                status: "recorded",
              });
              return {
                select() {
                  return {
                    async single() {
                      return { data: paymentRow, error: null };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "deposits") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async limit() {
                      return { data: state.deposits, error: null };
                    },
                    async maybeSingle() {
                      return {
                        data: {
                          ...state.deposits[0],
                          deposit_account: "Operating",
                          deposit_date: "2026-08-29",
                          customer_name: "Customer One",
                          project_id: "project-1",
                          payment_method: "ACH",
                          created_at: "2026-08-29T00:00:00.000Z",
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "invoice_payments") {
          return {
            select() {
              return {
                async eq() {
                  return { data: [], error: null };
                },
              };
            },
            async insert(row: Record<string, unknown>) {
              void row;
              return { error: { message: "injected invoice allocation failure" } };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as SupabaseClient;

    const { createPaymentReceived } = await import("@/lib/payments-received-db");
    await expect(
      createPaymentReceived(
        {
          idempotency_key: "payment-request-1",
          invoice_id: "invoice-1",
          project_id: "project-1",
          customer_name: "Customer One",
          payment_date: "2026-08-29",
          amount: 100,
          payment_method: "ACH",
          deposit_account: "Operating",
        },
        fake
      )
    ).rejects.toThrow("injected invoice allocation failure");

    expect(state.payments).toHaveLength(0);
    expect(state.deposits).toHaveLength(0);
    expect(state.allocations).toHaveLength(0);
  });

  it("rolls back the invoice header when atomic item insertion fails", async () => {
    const state = { invoices: [] as Array<Record<string, unknown>> };
    runtime.client = {
      async rpc(name: string) {
        if (name !== "create_invoice_atomic") throw new Error(`Unexpected RPC: ${name}`);
        return { data: null, error: { message: "injected invoice item failure" } };
      },
      from(table: string) {
        if (table === "invoices") {
          return {
            insert(row: Record<string, unknown>) {
              const saved = { id: "invoice-1", ...row };
              state.invoices.push(saved);
              return {
                select() {
                  return {
                    async single() {
                      return { data: saved, error: null };
                    },
                  };
                },
              };
            },
            delete() {
              return {
                async eq() {
                  return { error: { message: "injected invoice cleanup failure" } };
                },
              };
            },
          };
        }
        if (table === "invoice_items") {
          return {
            async insert() {
              return { error: { message: "injected invoice item failure" } };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const { createInvoice } = await import("@/lib/invoices-db");
    await expect(
      createInvoice({
        invoiceNo: "INV-ATOMICITY-1",
        projectId: "project-1",
        clientName: "Customer One",
        issueDate: "2026-08-29",
        dueDate: "2026-09-29",
        lineItems: [{ description: "Work", qty: 1, unitPrice: 100, amount: 100 }],
      })
    ).rejects.toThrow("injected invoice item failure");
    expect(state.invoices).toHaveLength(0);
  });

  it("preserves the invoice header and old items when atomic replacement insertion fails", async () => {
    const state = {
      invoice: {
        id: "invoice-1",
        invoice_no: "INV-1",
        project_id: "project-1",
        customer_id: null,
        client_name: "Old Customer",
        issue_date: "2026-08-01",
        due_date: "2026-09-01",
        status: "Draft",
        notes: null,
        tax_pct: 0,
        subtotal: 50,
        tax_amount: 0,
        total: 50,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      },
      items: [
        {
          id: "item-old",
          invoice_id: "invoice-1",
          description: "Old item",
          qty: 1,
          unit_price: 50,
          amount: 50,
        },
      ] as Array<Record<string, unknown>>,
    };
    runtime.client = {
      async rpc(name: string) {
        if (name !== "update_invoice_atomic") throw new Error(`Unexpected RPC: ${name}`);
        return { data: null, error: { message: "injected replacement item failure" } };
      },
      from(table: string) {
        if (table === "invoices") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: state.invoice, error: null };
                    },
                  };
                },
              };
            },
            update(patch: Record<string, unknown>) {
              return {
                async eq() {
                  Object.assign(state.invoice, patch);
                  return { error: null };
                },
              };
            },
          };
        }
        if (table === "invoice_items") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async order() {
                      return { data: state.items, error: null };
                    },
                  };
                },
              };
            },
            delete() {
              return {
                async eq() {
                  state.items = [];
                  return { error: null };
                },
              };
            },
            async insert() {
              return { error: { message: "injected replacement item failure" } };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const { updateInvoice } = await import("@/lib/invoices-db");
    const updated = await updateInvoice("invoice-1", {
      clientName: "New Customer",
      lineItems: [{ description: "Replacement", qty: 2, unitPrice: 60, amount: 120 }],
    });

    expect(updated).toBe(false);
    expect(state.invoice.client_name).toBe("Old Customer");
    expect(state.invoice.total).toBe(50);
    expect(state.items).toEqual([
      expect.objectContaining({ id: "item-old", description: "Old item", amount: 50 }),
    ]);
  });

  it("preserves invoice item identity when an atomic update changes only header fields", async () => {
    const rpc = vi.fn(async () => ({ data: { invoice_id: "invoice-1" }, error: null }));
    runtime.client = {
      rpc,
      from(table: string) {
        if (table === "invoices") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          id: "invoice-1",
                          invoice_no: "INV-1",
                          project_id: "project-1",
                          customer_id: null,
                          client_name: "Original Customer",
                          issue_date: "2026-08-01",
                          due_date: "2026-09-01",
                          status: "Draft",
                          notes: null,
                          tax_pct: 0,
                          subtotal: 50,
                          tax_amount: 0,
                          total: 50,
                          created_at: "2026-08-01T00:00:00.000Z",
                          updated_at: "2026-08-01T00:00:00.000Z",
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "invoice_items") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async order() {
                      return {
                        data: [
                          {
                            id: "item-stable",
                            invoice_id: "invoice-1",
                            description: "Original item",
                            qty: 1,
                            unit_price: 50,
                            amount: 50,
                          },
                        ],
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const { updateInvoice } = await import("@/lib/invoices-db");
    await expect(updateInvoice("invoice-1", { notes: "Header-only change" })).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith(
      "update_invoice_atomic",
      expect.objectContaining({ p_items: null })
    );
  });

  it("fails closed without an orphan expense when atomic expense creation fails", async () => {
    const state = { expenses: [] as Array<Record<string, unknown>> };
    runtime.client = {
      async rpc(name: string) {
        if (name !== "create_expense_atomic") throw new Error(`Unexpected RPC: ${name}`);
        return {
          data: null,
          error: { message: "injected expense line failure" },
        };
      },
      from(table: string) {
        throw new Error(`Atomic create must not write ${table} directly`);
      },
    };

    const { createExpense } = await import("@/lib/expenses-db");
    await expect(
      createExpense({
        idempotencyKey: "expense-failure-injection",
        date: "2026-08-29",
        vendorName: "Injected Vendor",
        lines: [
          {
            projectId: "project-1",
            category: "Materials",
            amount: 100,
          },
        ],
      })
    ).rejects.toThrow("injected expense line failure");
    expect(state.expenses).toHaveLength(0);
  });
});
