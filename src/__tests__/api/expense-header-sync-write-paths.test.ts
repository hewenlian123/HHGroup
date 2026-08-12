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
    from(table: string) {
      if (table === "expenses") {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq() {
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        events.push(`expense:${String(payload.status ?? payload.vendor_name)}`);
                        return { data: { id: "expense-1", ...payload }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "expense_lines") {
        return {
          select() {
            return {
              eq() {
                return {
                  limit() {
                    return {
                      async maybeSingle() {
                        events.push("line:load");
                        return { data: { id: "line-1" }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      select() {
                        return {
                          async maybeSingle() {
                            events.push(`line:${String(payload.amount)}`);
                            return { data: { id: "line-1" }, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
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

  it("syncs a line amount PATCH to the expense header after the line update", async () => {
    const events: string[] = [];
    const supabase = createPatchSupabase(events);

    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    mocks.syncExpenseHeaderAmountFromLinesWithClient.mockImplementation(async () => {
      events.push("sync:323.54");
      return 323.54;
    });

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
    expect(mocks.syncExpenseHeaderAmountFromLinesWithClient).toHaveBeenCalledWith(
      supabase,
      "expense-1",
      { lineId: "line-1", amount: 323.54 }
    );
    expect(json.expense).toMatchObject({ amount: 323.54, total: 323.54 });
    expect(events).toEqual(["expense:Home Depot", "line:load", "line:323.54", "sync:323.54"]);
  });

  it("syncs before a generic confirmed status update promotes stale headers", async () => {
    const events: string[] = [];
    const supabase = createPatchSupabase(events);

    mocks.getServerSupabaseInternalNoStore.mockReturnValue(supabase);
    mocks.syncExpenseHeaderAmountFromLinesWithClient.mockImplementation(async () => {
      events.push("sync:approved");
      return 925.54;
    });

    const { PATCH } = await import("@/app/api/expenses/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) }
    );

    expect(response.status).toBe(200);
    expect(events).toEqual(["sync:approved", "expense:approved"]);
  });
});
