import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { syncLaborWorkerProjectionWithClient } from "@/lib/labor-workers-projection";

describe("labor worker projection", () => {
  it("upserts only the verified worker id and name", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from } as unknown as SupabaseClient;

    await syncLaborWorkerProjectionWithClient(client, {
      id: "7de6a471-fd65-4fa8-8380-1a9cd0836645",
      name: "Worker One",
    });

    expect(from).toHaveBeenCalledWith("labor_workers");
    expect(upsert).toHaveBeenCalledWith(
      { id: "7de6a471-fd65-4fa8-8380-1a9cd0836645", name: "Worker One" },
      { onConflict: "id" }
    );
  });

  it("fails closed when the projection cannot be written", async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: "permission denied" } }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      syncLaborWorkerProjectionWithClient(client, { id: "worker-id", name: "Worker One" })
    ).rejects.toThrow("permission denied");
  });
});
