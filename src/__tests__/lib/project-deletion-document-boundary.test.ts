import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteProjectWithClient, forceDeleteProjectWithClient } from "@/lib/projects-db";

// This suite isolates document guards; the real pause guard has dedicated negative tests.
vi.mock("@/lib/worker-finance-write-pause", async (original) => ({
  ...(await original<typeof import("@/lib/worker-finance-write-pause")>()),
  assertWorkerFinanceWritesAvailable: vi.fn(async () => undefined),
}));

describe("project deletion document boundary", () => {
  beforeEach(() => vi.stubEnv("HH_WORKER_FINANCE_WRITES", "canonical"));
  afterEach(() => vi.unstubAllEnvs());
  for (const remove of [deleteProjectWithClient, forceDeleteProjectWithClient]) {
    it(`${remove.name} blocks attached documents before any delete`, async () => {
      const mutate = vi.fn();
      const query = {
        select: () => query,
        eq: async () => ({ count: 1, error: null }),
        delete: mutate,
      };
      const client = { from: () => query } as unknown as SupabaseClient;
      await expect(remove(client, "project")).rejects.toThrow("Delete project attachments first");
      expect(mutate).not.toHaveBeenCalled();
    });
    it(`${remove.name} blocks unreadable attachment counts before any delete`, async () => {
      const mutate = vi.fn();
      const query = {
        select: () => query,
        eq: async () => ({ count: null, error: { message: "unavailable" } }),
        delete: mutate,
      };
      const client = { from: () => query } as unknown as SupabaseClient;
      await expect(remove(client, "project")).rejects.toThrow(
        "Project attachments could not be checked"
      );
      expect(mutate).not.toHaveBeenCalled();
    });
  }
});
