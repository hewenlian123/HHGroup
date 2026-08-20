import { describe, expect, it } from "vitest";

import { resolveDuplicateEstimateLineSortOrder } from "@/lib/estimate-line-order";

describe("resolveDuplicateEstimateLineSortOrder", () => {
  it("places a duplicate between its source and the next line in the same section", () => {
    expect(
      resolveDuplicateEstimateLineSortOrder(
        [
          { id: "a", costCode: "100", sortOrder: 2 },
          { id: "b", costCode: "100", sortOrder: 3 },
          { id: "c", costCode: "200", sortOrder: 2.5 },
        ],
        "a"
      )
    ).toBe(2.5);
  });

  it("places a duplicate immediately after the final line in its section", () => {
    expect(
      resolveDuplicateEstimateLineSortOrder(
        [
          { id: "a", costCode: "100", sortOrder: 2 },
          { id: "b", costCode: "200", sortOrder: 3 },
        ],
        "a"
      )
    ).toBe(2.5);
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
