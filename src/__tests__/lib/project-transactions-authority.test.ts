import { describe, expect, it } from "vitest";
import { getProjectTransactions } from "@/lib/data";

describe("project transaction authority", () => {
  it("reports the unsupported product state instead of manufacturing a true empty list", () => {
    const result = getProjectTransactions("project-1");

    expect(result).toEqual({
      status: "not_supported",
      reason: "no_authoritative_project_transaction_source",
    });
    expect(Array.isArray(result)).toBe(false);
  });
});
