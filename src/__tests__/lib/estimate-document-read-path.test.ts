import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getEstimateHeaderById } from "@/lib/estimates-db";

describe("Estimate document read path", () => {
  it("loads the estimate header without rereading metadata or line items", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        number: "EST-100",
        client: "Performance Client",
        project: "Performance Project",
        status: "Draft",
        updated_at: "2026-07-30",
        approved_at: null,
      },
      error: null,
    });
    const query = {
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      single,
    };
    const from = vi.fn(() => query);
    const client = { from } as unknown as SupabaseClient;

    const estimate = await getEstimateHeaderById("11111111-1111-4111-8111-111111111111", client);

    expect(estimate).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      number: "EST-100",
      status: "Draft",
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("estimates");
  });
});
