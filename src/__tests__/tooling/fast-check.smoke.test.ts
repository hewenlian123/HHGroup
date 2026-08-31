import fc from "fast-check";
import { describe, it } from "vitest";

describe("fast-check tooling integration", () => {
  it("runs a deterministic non-business property", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (left, right) => left + right === right + left),
      { numRuns: 100, seed: 20260830 }
    );
  });
});
