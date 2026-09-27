import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: mocks.getSupabaseClient }));

import { deleteWorker } from "@/lib/labor-db";

describe("laborDb.deleteWorker", () => {
  it("propagates a rejected workers DELETE instead of reporting success", async () => {
    mocks.eq.mockResolvedValue({ error: { message: "permission denied for workers" } });
    mocks.from.mockReturnValue({ delete: () => ({ eq: mocks.eq }) });
    const client = { from: mocks.from };

    await expect(deleteWorker("worker-1", client as never)).rejects.toThrow(
      "permission denied for workers"
    );
  });
});
