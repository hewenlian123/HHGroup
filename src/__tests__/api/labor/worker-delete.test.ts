import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminClient: { name: "service-role" },
  client: { name: "request-rls" },
  deleteWorker: vi.fn(),
  getServerSupabaseAdmin: vi.fn(),
  requireSupabaseOwnerOrAdmin: vi.fn(),
  requireSupabaseOwnerOrAdminRequestClient: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: mocks.requireSupabaseOwnerOrAdmin,
  requireSupabaseOwnerOrAdminRequestClient: mocks.requireSupabaseOwnerOrAdminRequestClient,
}));
vi.mock("@/lib/data", () => ({ deleteWorker: mocks.deleteWorker, updateWorker: vi.fn() }));
vi.mock("@/lib/labor-db", () => ({
  getWorkerByIdWithClient: vi.fn(),
  getWorkerUsageWithClient: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE: "missing service client",
  getServerSupabaseAdmin: mocks.getServerSupabaseAdmin,
}));
vi.mock("@/lib/worker-rate-history-db", () => ({
  getWorkerCurrentDailyRateWithClient: vi.fn(),
  getWorkerRateHistoryWithClient: vi.fn(),
}));

function requestGuard() {
  return {
    ok: true as const,
    client: mocks.client,
    context: { email: "owner@example.test", role: "owner", user: { id: "owner-id" } },
    sessionResponse: {
      cookies: {
        getAll: () => [{ name: "sb-refresh", value: "refreshed", path: "/" }],
      },
    },
  };
}

describe("DELETE /api/labor/workers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSupabaseOwnerOrAdmin.mockResolvedValue({ ok: true, context: {} });
    mocks.requireSupabaseOwnerOrAdminRequestClient.mockResolvedValue(requestGuard());
    mocks.getServerSupabaseAdmin.mockReturnValue(mocks.adminClient);
    mocks.deleteWorker.mockResolvedValue(true);
  });

  it("uses the verified request client and preserves refreshed session cookies", async () => {
    const { DELETE } = await import("@/app/api/labor/workers/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/labor/workers/worker-1", { method: "DELETE" }),
      {
        params: Promise.resolve({ id: "worker-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.requireSupabaseOwnerOrAdminRequestClient).toHaveBeenCalledOnce();
    expect(mocks.deleteWorker).toHaveBeenCalledWith("worker-1", mocks.client);
    expect(response.headers.get("set-cookie")).toContain("sb-refresh=refreshed");
  });

  it("returns a dependency conflict without reporting deletion success", async () => {
    mocks.deleteWorker.mockResolvedValueOnce(false);
    const { DELETE } = await import("@/app/api/labor/workers/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/labor/workers/worker-1", { method: "DELETE" }),
      {
        params: Promise.resolve({ id: "worker-1" }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("returns a server failure when the database rejects deletion", async () => {
    mocks.deleteWorker.mockRejectedValueOnce(new Error("permission denied for workers"));
    const { DELETE } = await import("@/app/api/labor/workers/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/labor/workers/worker-1", { method: "DELETE" }),
      {
        params: Promise.resolve({ id: "worker-1" }),
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      message: "permission denied for workers",
    });
  });
});
