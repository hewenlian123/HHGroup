import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Estimate E2E fixture teardown contract", () => {
  it("is localhost-only, transactional, ordered, and verifies no residue", () => {
    const source = readFileSync(resolve("tests/e2e-estimate-fixture-teardown.ts"), "utf8");

    expect(source).toContain("assertEstimateCertificationLocalOnly");
    expect(source).toContain("sql.begin");

    const snapshotDelete = source.indexOf("delete from public.estimate_snapshots");
    const estimateDelete = source.indexOf("delete from public.estimates");
    expect(snapshotDelete).toBeGreaterThan(-1);
    expect(estimateDelete).toBeGreaterThan(snapshotDelete);

    expect(source).toContain("select estimate_id from public.estimate_snapshots");
    expect(source).toContain("select id from public.estimates");
    expect(source).toContain("Estimate fixture teardown left residue");
  });
});
