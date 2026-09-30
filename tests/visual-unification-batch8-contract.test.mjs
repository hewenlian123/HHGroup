import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("monthly labor and cost allocation use the list frame and overview money", () => {
  for (const path of ["src/app/labor/monthly/page.tsx", "src/app/labor/cost-allocation/page.tsx"]) {
    const page = source(path);
    assert.match(page, /frame="list"/);
    assert.match(page, /variant="workspace"/);
    assert.match(page, /sectionCardClass/);
    assert.match(page, /formatOverviewMoney/);
    assert.match(page, /text-\[var\(--hh-link\)\]/);
    assert.doesNotMatch(page, /formatCurrency\(/);
    assert.doesNotMatch(page, /border-gray-/);
    assert.doesNotMatch(page, /border-slate-/);
    assert.doesNotMatch(page, /bg-slate-/);
  }
});

test("labor overview and costs workspace uses the same list chrome", () => {
  const page = source("src/app/labor/workspace-client.tsx");
  assert.match(page, /frame="list"/);
  assert.match(page, /variant="workspace"/);
  assert.match(page, /sectionCardClass/);
  assert.match(page, /formatOverviewMoney/);
  assert.match(page, /text-\[var\(--hh-link\)\]/);
  assert.doesNotMatch(page, /formatCurrency\(/);
  assert.doesNotMatch(page, /rounded-hh-standard/);
});
