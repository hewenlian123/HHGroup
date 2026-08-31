import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureWorkerReimbursementForApprovedExpense: vi.fn(),
  getExpenseById: vi.fn(),
  getServerSupabaseInternalNoStore: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  requireSupabaseOwnerOrAdminWithClient: vi.fn(),
  syncExpenseHeaderAmountFromLinesWithClient: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
  requireSupabaseOwnerOrAdminWithClient: mocks.requireSupabaseOwnerOrAdminWithClient,
}));

vi.mock("@/lib/supabase-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase-server")>();
  return {
    ...actual,
    getServerSupabaseInternalNoStore: mocks.getServerSupabaseInternalNoStore,
  };
});

vi.mock("@/lib/expenses-db", () => ({
  ensureWorkerReimbursementForApprovedExpense: mocks.ensureWorkerReimbursementForApprovedExpense,
  getExpenseById: mocks.getExpenseById,
  syncExpenseHeaderAmountFromLinesWithClient: mocks.syncExpenseHeaderAmountFromLinesWithClient,
}));

function approvedInboxDraft(amount: number) {
  return {
    id: "expense-1",
    date: "2026-06-13",
    vendorName: "Home Depot",
    paymentMethod: "Credit Card",
    referenceNo: "INBOX-UP-test",
    attachments: [],
    lines: [{ id: "line-1", projectId: "project-1", category: "Materials", amount }],
    status: "needs_review",
    paymentAccountId: "payment-account-1",
    sourceType: "receipt_upload",
  };
}

function createApproveInboxSupabase(events: string[]) {
  return {
    from(table: string) {
      if (table !== "expenses") throw new Error(`Unexpected table ${table}`);
      return {
        update(payload: Record<string, unknown>) {
          return {
            async eq() {
              events.push(`status:${String(payload.status)}`);
              return { error: null };
            },
          };
        },
      };
    },
  };
}

function createPatchSupabase(events: string[]) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      events.push(`rpc:${name}`);
      const linePatch = args.p_line_patch as { amount?: number };
      const headerPatch = args.p_header_patch as {
        vendorName?: string;
        status?: string;
      };
      return {
        data: {
          id: args.p_expense_id,
          expense_id: args.p_expense_id,
          expense_date: "2026-06-13",
          vendor_name: headerPatch.vendorName ?? "Home Depot",
          payment_method: "Credit Card",
          reference_no: "INBOX-UP-test",
          notes: null,
          status: headerPatch.status ?? "needs_review",
          ...(linePatch.amount == null
            ? { amount: 52.34, total: 52.34 }
            : { amount: linePatch.amount, total: linePatch.amount }),
        },
        error: null,
      };
    }),
  };
}

describe("expense header sync write paths", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ensureWorkerReimbursementForApprovedExpense.mockReset();
    mocks.getExpenseById.mockReset();
    mocks.getServerSupabaseInternalNoStore.mockReset();
    mocks.requireAuthenticatedUser.mockReset();
    mocks.requireSupabaseOwnerOrAdminWithClient
      .mockReset()
      .mockImplementation(async (_request: Request, createClient: () => unknown) => ({
        ok: true,
        context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
        client: createClient(),
      }));
    mocks.syncExpenseHeaderAmountFromLinesWithClient.mockReset();
    mocks.requireAuthenticatedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  });

  it("syncs a stale inbox draft header before approving it", async () => {
    const events: string[] = [];
    const supabase = createApproveInboxSupabase(events);
    const current = approvedInboxDraft(52.34);

    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    mocks.getExpenseById.mockResolvedValueOnce(current).mockResolvedValueOnce({
      ...current,
      status: "approved",
    });
    mocks.syncExpenseHeaderAmountFromLinesWithClient.mockImplementation(async () => {
      events.push("sync:52.34");
      return 52.34;
    });
    mocks.ensureWorkerReimbursementForApprovedExpense.mockImplementation(async () => {
      events.push("bridge");
    });

    const { POST } = await import("@/app/api/financial/expenses/[id]/approve-inbox/route");
    const response = await POST(new Request("http://localhost/api/financial/expenses/expense-1"), {
      params: Promise.resolve({ id: "expense-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.syncExpenseHeaderAmountFromLinesWithClient).toHaveBeenCalledWith(
      supabase,
      "expense-1"
    );
    expect(events).toEqual(["sync:52.34", "status:approved", "bridge"]);
  });

  it("updates a line amount and its header mirrors through one atomic RPC", async () => {
    const events: string[] = [];
    const supabase = createPatchSupabase(events);

    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({ vendorName: "Home Depot", amount: 323.54 }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("update_expense_atomic", {
      p_expense_id: "expense-1",
      p_header_patch: { vendorName: "Home Depot" },
      p_line_patch: { amount: 323.54 },
      p_apply_deduction: false,
      p_deduction: null,
    });
    expect(mocks.syncExpenseHeaderAmountFromLinesWithClient).not.toHaveBeenCalled();
    expect(json.expense).toMatchObject({
      id: "expense-1",
      vendor_name: "Home Depot",
      amount: 323.54,
      total: 323.54,
    });
    expect(events).toEqual(["rpc:update_expense_atomic"]);
  });

  it("accepts a line-only patch and returns the complete expense header", async () => {
    const events: string[] = [];
    const supabase = createPatchSupabase(events);

    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({ amount: 75 }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("update_expense_atomic", {
      p_expense_id: "expense-1",
      p_header_patch: {},
      p_line_patch: { amount: 75 },
      p_apply_deduction: false,
      p_deduction: null,
    });
    expect(json.expense).toMatchObject({
      id: "expense-1",
      expense_date: "2026-06-13",
      vendor_name: "Home Depot",
      amount: 75,
      total: 75,
    });
    expect(events).toEqual(["rpc:update_expense_atomic"]);
  });

  it("syncs and promotes a confirmed status inside one atomic RPC", async () => {
    const events: string[] = [];
    const supabase = createPatchSupabase(events);

    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) }
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("update_expense_atomic", {
      p_expense_id: "expense-1",
      p_header_patch: { status: "approved" },
      p_line_patch: {},
      p_apply_deduction: false,
      p_deduction: null,
    });
    expect(mocks.syncExpenseHeaderAmountFromLinesWithClient).not.toHaveBeenCalled();
    expect(events).toEqual(["rpc:update_expense_atomic"]);
  });
});
