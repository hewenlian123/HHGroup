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

  it("voids Payment Received through exactly one atomic RPC without direct table writes", async () => {
    const rpcResult = {
      payment_id: "payment-void-1",
      invoice_id: "invoice-void-1",
      project_id: "project-void-1",
      deposit_id: "deposit-void-1",
      invoice_payment_id: "allocation-void-1",
      invoice_status: "Sent",
      paid_total: 0,
      balance_due: 100,
      reused: false,
    };
    const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
    const from = vi.fn(() => {
      throw new Error("Payment Void must not issue direct table reads or writes");
    });
    const fake = { rpc, from } as unknown as SupabaseClient;

    const { voidPaymentReceived } = await import("@/lib/payments-received-db");
    await expect(voidPaymentReceived("payment-void-1", fake)).resolves.toEqual(rpcResult);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("void_payment_received_atomic", {
      p_payment_id: "payment-void-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("preserves an atomic Payment Void RPC failure and never falls through to table writes", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "injected atomic Payment Void failure" },
    }));
    const from = vi.fn(() => {
      throw new Error("Payment Void must not issue direct table reads or writes");
    });
    const fake = { rpc, from } as unknown as SupabaseClient;

    const { voidPaymentReceived } = await import("@/lib/payments-received-db");
    await expect(voidPaymentReceived("payment-void-2", fake)).rejects.toThrow(
      "injected atomic Payment Void failure"
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("fails closed when the atomic Payment Void RPC returns a malformed success payload", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        payment_id: "payment-void-3",
        invoice_id: "invoice-void-3",
        reused: false,
      },
      error: null,
    }));
    const fake = { rpc } as unknown as SupabaseClient;

    const { voidPaymentReceived } = await import("@/lib/payments-received-db");
    await expect(voidPaymentReceived("payment-void-3", fake)).rejects.toThrow(
      "Atomic Payment Void RPC returned an invalid result."
    );
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

  it("uses one RPC for milestone Invoice create, linkage, and activity", async () => {
    const rpc = vi.fn(async () => ({
      data: { invoice_id: "44444444-4444-4444-8444-444444444444", reused: false, linked: true },
      error: null,
    }));
    const fake = {
      rpc,
      from() {
        throw new Error("milestone Invoice contract must not issue follow-up table writes");
      },
    } as unknown as SupabaseClient;

    const { createEstimateMilestoneInvoiceAtomicWithClient } = await import("@/lib/invoices-db");
    await expect(
      createEstimateMilestoneInvoiceAtomicWithClient(
        {
          idempotencyKey: "invoice-milestone:estimate-1:milestone-1",
          invoiceNo: "INV-ATOMIC-MILESTONE-001",
          projectId: "11111111-1111-4111-8111-111111111111",
          customerId: "22222222-2222-4222-8222-222222222222",
          clientName: "Atomic Customer",
          issueDate: "2026-08-31",
          dueDate: "2026-09-30",
          taxPct: 5,
          notes: "Atomic milestone",
          lineItems: [{ description: "Deposit", qty: 1, unitPrice: 476.19, amount: 476.19 }],
          estimateId: "33333333-3333-4333-8333-333333333333",
          scheduleItemId: "55555555-5555-4555-8555-555555555555",
          actor: {
            userId: "66666666-6666-4666-8666-666666666666",
            label: "owner@example.com",
          },
        },
        fake
      )
    ).resolves.toEqual({
      id: "44444444-4444-4444-8444-444444444444",
      reused: false,
      linked: true,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_estimate_milestone_invoice_atomic", {
      p_idempotency_key: "invoice-milestone:estimate-1:milestone-1",
      p_header: {
        invoice_no: "INV-ATOMIC-MILESTONE-001",
        project_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "22222222-2222-4222-8222-222222222222",
        client_name: "Atomic Customer",
        issue_date: "2026-08-31",
        due_date: "2026-09-30",
        status: "Draft",
        notes: "Atomic milestone",
        tax_pct: 5,
      },
      p_items: [{ description: "Deposit", qty: 1, unit_price: 476.19 }],
      p_estimate_id: "33333333-3333-4333-8333-333333333333",
      p_schedule_item_id: "55555555-5555-4555-8555-555555555555",
      p_actor_user_id: "66666666-6666-4666-8666-666666666666",
      p_actor_label: "owner@example.com",
    });
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
