import { describe, expect, it } from "vitest";

import { resolveDuplicateEstimateLineSortOrder } from "@/lib/estimate-line-order";

describe("resolveDuplicateEstimateLineSortOrder", () => {
  it("appends a duplicate using an integer without shifting existing rows", () => {
    expect(
      resolveDuplicateEstimateLineSortOrder(
        [
          { id: "a", costCode: "100", sortOrder: 2 },
          { id: "b", costCode: "100", sortOrder: 3 },
          { id: "c", costCode: "200", sortOrder: 4 },
        ],
        "a"
      )
    ).toBe(5);
  });

  it("uses an unused integer across sections when the source is its final line", () => {
    expect(
      resolveDuplicateEstimateLineSortOrder(
        [
          { id: "a", costCode: "100", sortOrder: 2 },
          { id: "b", costCode: "200", sortOrder: 3 },
        ],
        "a"
      )
    ).toBe(4);
  });

  it("falls back to the existing append behavior when persisted order is unavailable", () => {
    expect(
      resolveDuplicateEstimateLineSortOrder(
        [{ id: "legacy", costCode: "100", sortOrder: undefined }],
        "legacy"
      )
    ).toBeUndefined();

    expect(
      resolveDuplicateEstimateLineSortOrder(
        [{ id: "legacy-null", costCode: "100", sortOrder: null }],
        "legacy-null"
      )
    ).toBeUndefined();
  });
});
