import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  getProjectById,
  getProjectByIdWithClient,
  getProjectBySourceEstimateId,
  getProjects,
  getProjectsDashboard,
} from "@/lib/projects-db";

describe("Project status read model", () => {
  it.each([
    ["active", "active"],
    ["Active", "active"],
    ["pending", "pending"],
    ["Pending", "pending"],
    ["completed", "completed"],
    ["Completed", "completed"],
    ["On Hold", "on_hold"],
    ["on_hold", "on_hold"],
    ["on-hold", "on_hold"],
    ["  ON  HOLD  ", "on_hold"],
    ["withhold", "pending"],
    ["unknown", "pending"],
    [null, "pending"],
  ])("reads %s as %s through every project reader", async (stored, expected) => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "[E2E] Status contract",
      status: stored,
      budget: 0,
      spent: 0,
      created_at: "2026-09-05",
      updated_at: "2026-09-05",
    };
    // Mock only the HTTP boundary; exercise the real Supabase queries and read models.
    const client = createClient("http://127.0.0.1:54321", "unit-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify([row]), {
            headers: { "Content-Type": "application/json" },
          }),
      },
    });
    expect((await getProjects(client)).map((p) => p.status)).toEqual([expected]);
    expect((await getProjectsDashboard(200, client)).map((p) => p.status)).toEqual([expected]);
    expect((await getProjectById(row.id, client))?.status).toBe(expected);
    expect((await getProjectByIdWithClient(client, row.id))?.status).toBe(expected);
    expect((await getProjectBySourceEstimateId(row.id, client))?.status).toBe(expected);
  });
});
