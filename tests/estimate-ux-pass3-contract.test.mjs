import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("estimate customer and project sheets use shared field chrome", () => {
  const edit = source("src/app/estimates/_components/estimate-edit-customer-section.tsx");
  const created = source("src/app/estimates/_components/estimate-new-customer-section.tsx");
  const css = source("src/app/estimates/_components/estimate-builder-operational.css");

  assert.match(edit, /name="clientName"/);
  assert.match(edit, /name="projectName"/);
  assert.match(edit, /saveEstimateMetaAction/);
  assert.match(created, /htmlFor="new-clientName"/);
  assert.match(created, /htmlFor="new-projectName"/);
  assert.doesNotMatch(edit, /ebSheetInput\("text-sm"\)|ebSheetInput\("text-sm/);
  assert.doesNotMatch(created, /ebSheetInput\("text-sm"\)|text-sm text-foreground/);
  assert.match(css, /eb-estimate-details-sheet[\s\S]*background: var\(--hh-input-background\)/);
  assert.match(
    css,
    /eb-estimate-details-sheet \.eb-sheet-input:focus-visible[\s\S]*var\(--hh-link\)/
  );
  assert.match(created, /onClientNameChange/);
  assert.match(created, /onProjectNameChange/);
});
