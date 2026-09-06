import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteProjectWithClient, forceDeleteProjectWithClient } from "@/lib/projects-db";

describe("project deletion document boundary", () => {
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
