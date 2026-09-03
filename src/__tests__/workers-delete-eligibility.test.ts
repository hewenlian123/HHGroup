import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { from: vi.fn() },
  deleteWorker: vi.fn(),
  getWorkerUsageWithClient: vi.fn(),
  requireSupabaseOwnerOrAdminServerActionClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerActionClient:
    mocks.requireSupabaseOwnerOrAdminServerActionClient,
}));
vi.mock("@/lib/workers-db", () => ({
  deleteWorker: mocks.deleteWorker,
  insertWorker: vi.fn(),
  updateWorker: vi.fn(),
}));
vi.mock("@/lib/labor-db", () => ({
  getWorkerUsageWithClient: mocks.getWorkerUsageWithClient,
}));

describe("Worker destructive eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSupabaseOwnerOrAdminServerActionClient.mockResolvedValue({
      ok: true,
      context: { user: { id: "owner-1" }, role: "owner", email: "owner@example.test" },
      client: mocks.client,
    });
    mocks.getWorkerUsageWithClient.mockResolvedValue({ used: false });
    mocks.deleteWorker.mockResolvedValue(undefined);
  });

  it("blocks deletion when a dependency read fails", async () => {
    mocks.getWorkerUsageWithClient.mockRejectedValueOnce(
      new Error("permission denied for table labor_entries")
    );
    const { deleteWorkerAction } = await import("@/app/workers/actions");

    await expect(deleteWorkerAction("worker-1")).resolves.toEqual({
      ok: false,
      error: "permission denied for table labor_entries",
    });
    expect(mocks.deleteWorker).not.toHaveBeenCalled();
  });

  it("blocks deletion when the existing eligibility policy finds dependencies", async () => {
    mocks.getWorkerUsageWithClient.mockResolvedValueOnce({ used: true, reason: "entries" });
    const { deleteWorkerAction } = await import("@/app/workers/actions");

    const result = await deleteWorkerAction("worker-2");

    expect(result).toEqual({ ok: false, error: "Worker is used by labor entries." });
    expect(mocks.deleteWorker).not.toHaveBeenCalled();
  });

  it("deletes only after every existing eligibility read succeeds empty", async () => {
    const { deleteWorkerAction } = await import("@/app/workers/actions");

    await expect(deleteWorkerAction("worker-3")).resolves.toEqual({ ok: true });
    expect(mocks.getWorkerUsageWithClient).toHaveBeenCalledWith(mocks.client, "worker-3");
    expect(mocks.deleteWorker).toHaveBeenCalledWith("worker-3", mocks.client);
  });
});
