import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  createExpenseFromPaidReimbursement: vi.fn(),
  recordWorkerPayrollSettlementWithClient: vi.fn(),
  getWorkerPayrollSettlementReplaySelectionWithClient: vi.fn(),
  recordReimbursementPaymentAtomicWithClient: vi.fn(),
  getReimbursementById: vi.fn(),
  markReimbursementPaid: vi.fn(),
  recordBatchReimbursementPayment: vi.fn(),
  computeImplicitSettlement: vi.fn(),
  syncExpenseHeaderAmountFromLinesWithClient: vi.fn(),
  getServerSupabaseAdminNoStore: vi.fn(),
  getServerSupabaseInternalNoStore: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminWithClient: async (
    _request: Request,
    createClient: () => unknown
  ) => ({
    ok: true as const,
    context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
    client: createClient(),
  }),
}));

vi.mock("@/lib/supabase-server", () => ({
  SUPABASE_MISSING_SERVER_ENV_MESSAGE: "Supabase is not configured.",
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE: "Privileged Supabase is not configured.",
  appendLaborSettlementServiceRoleHint: (message: string) => message,
  getServerSupabaseAdmin: () => mocks.client,
  getServerSupabaseAdminNoStore: () => mocks.getServerSupabaseAdminNoStore(),
  getServerSupabaseInternal: () => mocks.client,
  getServerSupabaseInternalNoStore: () => mocks.getServerSupabaseInternalNoStore(),
}));

vi.mock("@/lib/data", () => ({
  getARSummary: vi.fn(),
}));

vi.mock("@/lib/expenses-db", () => ({
  createExpenseFromPaidReimbursement: (...args: unknown[]) =>
    mocks.createExpenseFromPaidReimbursement(...args),
  syncExpenseHeaderAmountFromLinesWithClient: (...args: unknown[]) =>
    mocks.syncExpenseHeaderAmountFromLinesWithClient(...args),
}));

vi.mock("@/lib/subcontract-deductions-db", () => ({
  getSubcontractDeductionByExpenseId: vi.fn(),
  getSubcontractDeductionOptions: vi.fn(),
  replaceSubcontractDeductionForExpense: vi.fn(),
}));

vi.mock("@/lib/worker-reimbursements-db", () => ({
  getReimbursementById: (...args: unknown[]) => mocks.getReimbursementById(...args),
  markReimbursementPaid: (...args: unknown[]) => mocks.markReimbursementPaid(...args),
  recordBatchReimbursementPayment: (...args: unknown[]) =>
    mocks.recordBatchReimbursementPayment(...args),
  recordReimbursementPaymentAtomicWithClient: (...args: unknown[]) =>
    mocks.recordReimbursementPaymentAtomicWithClient(...args),
}));

vi.mock("@/lib/worker-payments-db", () => ({
  recordWorkerPayrollSettlementWithClient: (...args: unknown[]) =>
    mocks.recordWorkerPayrollSettlementWithClient(...args),
  getWorkerPayrollSettlementReplaySelectionWithClient: (...args: unknown[]) =>
    mocks.getWorkerPayrollSettlementReplaySelectionWithClient(...args),
}));

vi.mock("@/lib/worker-payment-implicit-settlement", () => ({
  computeImplicitSettlement: (...args: unknown[]) => mocks.computeImplicitSettlement(...args),
}));

beforeEach(() => {
  vi.resetModules();
  mocks.client = {};
  mocks.createExpenseFromPaidReimbursement.mockReset();
  mocks.recordWorkerPayrollSettlementWithClient.mockReset();
  mocks.getWorkerPayrollSettlementReplaySelectionWithClient.mockReset();
  mocks.getWorkerPayrollSettlementReplaySelectionWithClient.mockResolvedValue(null);
  mocks.getReimbursementById.mockReset();
  mocks.markReimbursementPaid.mockReset();
  mocks.recordBatchReimbursementPayment.mockReset();
  mocks.recordReimbursementPaymentAtomicWithClient.mockReset();
  mocks.computeImplicitSettlement.mockReset();
  mocks.syncExpenseHeaderAmountFromLinesWithClient.mockReset();
  mocks.getServerSupabaseAdminNoStore.mockReset();
  mocks.getServerSupabaseAdminNoStore.mockImplementation(() => mocks.client);
  mocks.getServerSupabaseInternalNoStore.mockReset();
  mocks.getServerSupabaseInternalNoStore.mockImplementation(() => mocks.client);
});

describe("financial atomicity failure injection", () => {
  it("constructs payroll and reimbursement write clients only from the server admin factory", async () => {
    mocks.client = {};
    mocks.getReimbursementById.mockResolvedValue(null);

    const payroll = await import("@/app/api/labor/workers/[id]/pay/route");
    const reimbursement = await import("@/app/api/worker-reimbursements/[id]/pay/route");
    const reimbursementBatch = await import("@/app/api/worker-reimbursements/create-payment/route");

    await payroll.POST(
      new Request("http://localhost/api/labor/workers/missing/pay", {
        method: "POST",
        body: JSON.stringify({ amount: 1, payment_method: "ACH" }),
      }),
      { params: Promise.resolve({ id: "" }) }
    );
    await reimbursement.POST(
      new Request("http://localhost/api/worker-reimbursements/reimb-1/pay", {
        method: "POST",
        body: JSON.stringify({ method: "ACH" }),
      }),
      { params: Promise.resolve({ id: "reimb-1" }) }
    );
    await reimbursementBatch.POST(
      new Request("http://localhost/api/worker-reimbursements/create-payment", {
        method: "POST",
        body: JSON.stringify({ reimbursementIds: [] }),
      })
    );

    expect(mocks.getServerSupabaseAdminNoStore).toHaveBeenCalledTimes(3);
    expect(mocks.getServerSupabaseInternalNoStore).not.toHaveBeenCalled();
  });

  it("fails privileged settlement routes with an explicit service-role configuration response", async () => {
    mocks.client = null;

    const payroll = await import("@/app/api/labor/workers/[id]/pay/route");
    const reimbursement = await import("@/app/api/worker-reimbursements/[id]/pay/route");
    const reimbursementBatch = await import("@/app/api/worker-reimbursements/create-payment/route");

    const responses = [
      await payroll.POST(
        new Request("http://localhost/api/labor/workers/worker-1/pay", {
          method: "POST",
          body: JSON.stringify({
            amount: 1,
            payment_method: "ACH",
            idempotency_key: "payroll-admin-client-required",
          }),
        }),
        { params: Promise.resolve({ id: "worker-1" }) }
      ),
      await reimbursement.POST(
        new Request("http://localhost/api/worker-reimbursements/reimb-1/pay", {
          method: "POST",
          body: JSON.stringify({ method: "ACH" }),
        }),
        { params: Promise.resolve({ id: "reimb-1" }) }
      ),
      await reimbursementBatch.POST(
        new Request("http://localhost/api/worker-reimbursements/create-payment", {
          method: "POST",
          body: JSON.stringify({ reimbursementIds: ["reimb-1"] }),
        })
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([503, 503, 503]);
    for (const response of responses) {
      expect((await response.json()).message).toBe("Privileged Supabase is not configured.");
    }
  });

  it("leaves no orphan expense when atomic bank reconciliation fails and is retried", async () => {
    const state = {
      transaction: {
        id: "bank-1",
        txn_date: "2026-08-29",
        description: "Injected bank debit",
        amount: -125,
        status: "unmatched" as const,
      },
      expenses: [] as Array<{ id: string; row: Record<string, unknown> }>,
      lines: [] as Array<Record<string, unknown>>,
    };

    const rpc = vi.fn(async (name: string) => {
      if (name !== "reconcile_bank_transaction_expense_atomic") {
        throw new Error(`Unexpected RPC: ${name}`);
      }
      return { data: null, error: { message: "injected bank link failure" } };
    });
    mocks.client = {
      rpc,
      from(table: string) {
        if (table === "bank_transactions") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: state.transaction, error: null };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Atomic reconcile must not write ${table} directly`);
      },
    };

    const { POST } = await import("@/app/api/financial/bank-transactions/route");
    const reconcile = () =>
      POST(
        new Request("http://localhost/api/financial/bank-transactions", {
          method: "POST",
          body: JSON.stringify({
            action: "reconcile",
            txId: "bank-1",
            type: "Expense",
            vendorName: "Injected Vendor",
            paymentMethod: "ACH",
          }),
        })
      );

    expect((await reconcile()).status).toBe(500);
    expect((await reconcile()).status).toBe(500);
    expect(state.transaction.status).toBe("unmatched");
    expect(state.expenses).toHaveLength(0);
    expect(state.lines).toHaveLength(0);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("leaves the expense header and line unchanged when atomic update fails", async () => {
    const state = {
      header: { id: "expense-1", vendor_name: "Original Vendor", vendor: "Original Vendor" },
      line: { id: "line-1", expense_id: "expense-1", amount: 50 },
    };

    const rpc = vi.fn(async (name: string) => {
      if (name !== "update_expense_atomic") throw new Error(`Unexpected RPC: ${name}`);
      return { data: null, error: { message: "injected expense line update failure" } };
    });
    mocks.client = {
      rpc,
      from(table: string) {
        throw new Error(`Atomic update must not write ${table} directly`);
      },
    };

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({ vendorName: "Changed Vendor", amount: 125 }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) }
    );

    expect(response.status).toBe(500);
    expect(state.header.vendor_name).toBe("Original Vendor");
    expect(state.header.vendor).toBe("Original Vendor");
    expect(state.line.amount).toBe(50);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails a single reimbursement payment when atomic expense creation fails", async () => {
    const pending = {
      id: "reimb-1",
      workerId: "worker-1",
      workerName: "Worker One",
      vendor: "Supplier",
      projectId: "project-1",
      amount: 75,
      description: "Mileage",
      status: "pending",
    };
    mocks.getReimbursementById.mockResolvedValue(pending);
    mocks.createExpenseFromPaidReimbursement.mockRejectedValue(
      new Error("injected expense creation failure")
    );
    mocks.markReimbursementPaid.mockResolvedValue({ ...pending, status: "paid" });
    mocks.recordReimbursementPaymentAtomicWithClient.mockRejectedValue(
      new Error("injected expense creation failure")
    );

    const { POST } = await import("@/app/api/worker-reimbursements/[id]/pay/route");
    const response = await POST(
      new Request("http://localhost/api/worker-reimbursements/reimb-1/pay", {
        method: "POST",
        body: JSON.stringify({ method: "ACH" }),
      }),
      { params: Promise.resolve({ id: "reimb-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("injected expense creation failure");
  });

  it("returns the atomically-created expense id for reimbursement payment retries", async () => {
    const reimbursement = {
      id: "reimb-1",
      workerId: "worker-1",
      workerName: "Worker One",
      vendor: "Supplier",
      projectId: "project-1",
      amount: 75,
      description: "Mileage",
      status: "paid",
    };
    mocks.getReimbursementById.mockResolvedValue({ ...reimbursement, status: "pending" });
    mocks.recordReimbursementPaymentAtomicWithClient.mockResolvedValue({
      payment: { id: "payment-1", totalAmount: 75 },
      updatedCount: 1,
      reimbursements: [reimbursement],
      expenseIds: ["expense-1"],
      reused: true,
    });

    const { POST } = await import("@/app/api/worker-reimbursements/[id]/pay/route");
    const response = await POST(
      new Request("http://localhost/api/worker-reimbursements/reimb-1/pay", {
        method: "POST",
        body: JSON.stringify({ method: "ACH" }),
      }),
      { params: Promise.resolve({ id: "reimb-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reimbursement,
      payment: { id: "payment-1", totalAmount: 75 },
      expenseId: "expense-1",
      expenseWarning: null,
      reused: true,
    });
  });

  it("fails a batch reimbursement payment when any atomic expense creation fails", async () => {
    const reimbursement = {
      id: "reimb-1",
      workerId: "worker-1",
      workerName: "Worker One",
      vendor: "Supplier",
      projectId: "project-1",
      amount: 75,
      description: "Mileage",
      status: "paid",
    };
    mocks.recordBatchReimbursementPayment.mockResolvedValue({
      payment: { id: "payment-1", totalAmount: 75 },
      updatedCount: 1,
      reimbursements: [reimbursement],
    });
    mocks.createExpenseFromPaidReimbursement.mockRejectedValue(
      new Error("injected expense creation failure")
    );
    mocks.recordReimbursementPaymentAtomicWithClient.mockRejectedValue(
      new Error("injected expense creation failure")
    );

    const { POST } = await import("@/app/api/worker-reimbursements/create-payment/route");
    const response = await POST(
      new Request("http://localhost/api/worker-reimbursements/create-payment", {
        method: "POST",
        body: JSON.stringify({ reimbursementIds: ["reimb-1"], paymentMethod: "ACH" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("injected expense creation failure");
  });

  it("rolls back payroll when the atomic settlement RPC fails, then retries exactly once", async () => {
    const payment = {
      id: "payment-1",
      workerId: "worker-1",
      projectId: null,
      paymentDate: "2026-08-29",
      amount: 50,
      paymentMethod: "ACH",
      notes: null,
      createdAt: "2026-08-29T00:00:00.000Z",
      laborEntryIds: null,
      idempotencyKey: "retry-key-1",
    };
    const state = {
      persistedPayment: null as typeof payment | null,
      laborSettled: false,
      rpcAttempts: 0,
    };

    mocks.recordWorkerPayrollSettlementWithClient.mockImplementation(async () => {
      state.rpcAttempts += 1;
      if (state.rpcAttempts === 1) {
        throw new Error("injected labor link failure");
      }
      if (state.persistedPayment) return { payment: state.persistedPayment, reused: true };
      state.persistedPayment = payment;
      state.laborSettled = true;
      return { payment, reused: false };
    });
    mocks.getWorkerPayrollSettlementReplaySelectionWithClient.mockImplementation(async () =>
      state.persistedPayment
        ? {
            paymentDate: payment.paymentDate,
            laborEntryIds: ["labor-1"],
            reimbursementIds: [],
            advanceIds: [],
          }
        : null
    );
    mocks.computeImplicitSettlement.mockResolvedValue({
      laborIds: ["labor-1"],
      reimbIds: [],
      expectedTotal: 50,
    });
    mocks.client = {};

    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const request = () =>
      new Request("http://localhost/api/labor/workers/worker-1/pay", {
        method: "POST",
        body: JSON.stringify({
          amount: 50,
          payment_method: "ACH",
          idempotency_key: "retry-key-1",
        }),
      });

    const first = await POST(request(), { params: Promise.resolve({ id: "worker-1" }) });
    expect(first.status).toBe(500);
    expect(state.persistedPayment).toBeNull();
    expect(state.laborSettled).toBe(false);

    const retry = await POST(request(), { params: Promise.resolve({ id: "worker-1" }) });
    const retryBody = await retry.json();
    expect(retry.status).toBe(200);
    expect(retryBody).toEqual({ ok: true, payment, reused: false });
    expect(state.laborSettled).toBe(true);

    const repeated = await POST(request(), { params: Promise.resolve({ id: "worker-1" }) });
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual({ ok: true, payment, reused: true });
    expect(state.rpcAttempts).toBe(3);
  });
});
