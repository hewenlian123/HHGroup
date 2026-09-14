import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureWorkerReimbursementForApprovedExpense: vi.fn(),
  getExpenseById: vi.fn(),
  getServerSupabaseInternalNoStore: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  requireSupabaseOwnerOrAdminWithClient: vi.fn(),
  requireSupabaseOwnerOrAdminRequestClient: vi.fn(),
  syncExpenseHeaderAmountFromLinesWithClient: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
  requireSupabaseOwnerOrAdminWithClient: mocks.requireSupabaseOwnerOrAdminWithClient,
  requireSupabaseOwnerOrAdminRequestClient: mocks.requireSupabaseOwnerOrAdminRequestClient,
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
      if (table !== "expense_operations") throw new Error(`Unexpected table ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { revision: 7 }, error: null }) }) }) };
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("transition_expense_operation");
      expect(args).toMatchObject({ p_expense_id: "expense-1", p_expected_revision: 7, p_action: "approve", p_payload: { cost_allocation: "project_cost" } });
      expect(args.p_request_id).toEqual(expect.any(String));
      events.push("atomic:approve");
      return { error: null, data: { revision: 8 } };
    }),
  };
}

function createPatchSupabase(events: string[], lines = [{ id: "line-1" }]) {
  return {
    from: () => ({ select: () => ({ eq: async () => ({ data: lines, error: null }) }) }),
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
    mocks.requireSupabaseOwnerOrAdminRequestClient.mockReset().mockImplementation(async () => ({
      ok: true, client: mocks.getServerSupabaseInternalNoStore(),
      context: { user: { id: "owner-1" } },
    }));
    mocks.syncExpenseHeaderAmountFromLinesWithClient.mockReset();
    mocks.requireAuthenticatedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  });

  it.each(["INBOX-UP-test", undefined])(
    "validates and approves in one versioned transaction with reference %s",
    async (referenceNo) => {
      const events: string[] = [];
      const supabase = createApproveInboxSupabase(events);
      const current = { ...approvedInboxDraft(52.34), referenceNo };

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
      const response = await POST(
        new Request("http://localhost/api/financial/expenses/expense-1"),
        {
          params: Promise.resolve({ id: "expense-1" }),
        }
      );

      expect(response.status).toBe(200);
      expect(mocks.syncExpenseHeaderAmountFromLinesWithClient).not.toHaveBeenCalled();
      expect(events).toEqual(["atomic:approve"]);
    }
  );

  it("blocks Expense reimbursement approval before amount or status mutation", async () => {
    const events: string[] = [];
    mocks.getServerSupabaseInternalNoStore.mockReturnValue(createApproveInboxSupabase(events));
    mocks.getExpenseById.mockResolvedValue({
      ...approvedInboxDraft(52.34),
      sourceType: "reimbursement",
    });
    const { POST } = await import("@/app/api/financial/expenses/[id]/approve-inbox/route");
    const response = await POST(new Request("http://localhost/api/financial/expenses/expense-1"), {
      params: Promise.resolve({ id: "expense-1" }),
    });
    expect(response.status).toBe(409);
    expect(events).toEqual([]);
    expect(mocks.syncExpenseHeaderAmountFromLinesWithClient).not.toHaveBeenCalled();
    expect(mocks.ensureWorkerReimbursementForApprovedExpense).not.toHaveBeenCalled();
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
      p_line_patch: { lineId: "line-1", amount: 323.54 },
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

  it("does not approve a zero-amount receipt draft", async () => {
    const events: string[] = [];
    mocks.getServerSupabaseInternalNoStore.mockReturnValue(createApproveInboxSupabase(events));
    mocks.getExpenseById.mockResolvedValue(approvedInboxDraft(0));
    const { POST } = await import("@/app/api/financial/expenses/[id]/approve-inbox/route");
    const response = await POST(new Request("http://localhost/api/financial/expenses/expense-1"), {
      params: Promise.resolve({ id: "expense-1" }),
    });
    expect(response.status).toBe(409);
    expect(events).toEqual([]);
  });

  it("saving fields cannot implicitly approve a receipt", async () => {
    const events: string[] = [];
    const supabase = createPatchSupabase(events);
    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({ notes: "Edited", status: "approved" }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) }
    );
    expect(response.status).toBe(200);
    expect(supabase.rpc.mock.calls[0][1].p_header_patch).toEqual({ notes: "Edited" });
    expect((await response.json()).expense.status).toBe("needs_review");
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
      p_line_patch: { lineId: "line-1", amount: 75 },
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
  it("rejects an expense total as an ambiguous split line amount without writing", async () => {
    const events: string[] = [];
    const supabase = createPatchSupabase(events, [{ id: "line-1" }, { id: "line-2" }]);
    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({ amount: 40, notes: "Description only" }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) }
    );
    expect(response.status).toBe(400);
    expect(events).toEqual([]);
  });
});
