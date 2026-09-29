import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getExpenseById: vi.fn(),
  requireSupabaseOwnerOrAdminWithClient: vi.fn(),
  updateEq: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminWithClient: mocks.requireSupabaseOwnerOrAdminWithClient,
}));

vi.mock("@/lib/expenses-db", () => ({
  getExpenseById: mocks.getExpenseById,
}));

vi.mock("@/lib/supabase-server", () => ({
  SUPABASE_MISSING_SERVER_ENV_MESSAGE: "Supabase server env is missing.",
  getServerSupabaseInternalNoStore: () => ({ role: "service" }),
}));

import { POST } from "@/app/api/financial/expenses/[id]/mark-paid/route";

const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";

function expense(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPENSE_ID,
    status: "approved",
    sourceType: "company",
    workerId: null,
    paymentStatus: null,
    ...overrides,
  };
}

function request() {
  return new Request(`http://localhost/api/financial/expenses/${EXPENSE_ID}/mark-paid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentAccountId: "account-1", paidOn: "2026-09-28" }),
  });
}

describe("mark paid error handling", () => {
  beforeEach(() => {
    mocks.updateEq.mockReset().mockResolvedValue({ error: null });
    mocks.getExpenseById.mockReset();
    mocks.requireSupabaseOwnerOrAdminWithClient.mockReset().mockImplementation(async () => ({
      ok: true,
      client: {
        from: () => ({
          update: () => ({ eq: mocks.updateEq }),
        }),
      },
    }));
  });

  it("surfaces a database error for a legacy null payment status", async () => {
    mocks.getExpenseById.mockResolvedValue(expense());
    mocks.updateEq.mockResolvedValue({ error: { message: "connection refused" } });

    const response = await POST(request(), { params: { id: EXPENSE_ID } });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, message: "connection refused" });
  });

  it("surfaces a database error when the workflow status is already paid", async () => {
    mocks.getExpenseById.mockResolvedValue(expense({ status: "paid", paymentStatus: null }));
    mocks.updateEq.mockResolvedValue({ error: { message: "permission denied" } });

    const response = await POST(request(), { params: { id: EXPENSE_ID } });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.message).toBe("permission denied");
  });

  it("treats a canonical legacy refusal as a no-op", async () => {
    const current = expense();
    mocks.getExpenseById.mockResolvedValue(current);
    mocks.updateEq.mockResolvedValue({
      error: { message: "LEGACY_UNVERIFIED: Worker Expense is read-only." },
    });

    const response = await POST(request(), { params: { id: EXPENSE_ID } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, expense: current, legacy: true });
  });

  it("does not write worker reimbursements", async () => {
    const current = expense({ sourceType: "reimbursement", workerId: "worker-1" });
    mocks.getExpenseById.mockResolvedValue(current);

    const response = await POST(request(), { params: { id: EXPENSE_ID } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.legacy).toBe(true);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });
});
