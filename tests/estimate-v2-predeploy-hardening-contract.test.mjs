import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("operational-light compatibility actions and focus use the certified blue", () => {
  const globals = source("src/app/globals.css");
  const operationalLight = globals.match(
    /\[data-hh-theme="operational-light"\]\s*\{([\s\S]*?)\n\s*\}/
  )?.[1];

  assert.ok(operationalLight, "expected the operational-light compatibility block");
  assert.match(operationalLight, /--primary:\s*221\.2121212121 83\.1932773109% 53\.3333333333%/);
  assert.match(operationalLight, /--primary-foreground:\s*0 0% 100%/);
  assert.match(operationalLight, /--ring:\s*221\.2121212121 83\.1932773109% 53\.3333333333%/);
  assert.doesNotMatch(operationalLight, /--(?:primary|ring):\s*36 33% 54%/);
});

test("Estimate native date controls request the certified light browser surface", () => {
  const builderGlass = source("src/app/estimates/_components/estimate-builder-glass.css");

  assert.doesNotMatch(builderGlass, /color-scheme:\s*dark/);
  assert.match(
    builderGlass,
    /\.eb-date-field,[\s\S]*?input\[type="date"\][\s\S]*?color-scheme:\s*light/
  );
});

test("reduced motion preserves non-spatial state feedback", () => {
  const globals = source("src/app/globals.css");
  const list = source("src/app/estimates/estimate-list-operational.css");

  assert.doesNotMatch(globals, /(?:animation|transition)-duration:\s*0\.0+1ms\s*!important/);
  assert.doesNotMatch(list, /transition-duration:\s*0\.0+1ms\s*!important/);
  assert.match(globals, /prefers-reduced-motion:\s*reduce[\s\S]*?scroll-behavior:\s*auto/);
});

test("Estimate Preview keeps a visible focus outline in forced colors", () => {
  const globals = source("src/app/globals.css");

  assert.match(
    globals,
    /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.estimate-preview-tool-button:focus-visible[\s\S]*?outline:\s*2px solid CanvasText\s*!important/
  );
});

test("the Certified V2 Estimate composition does not mount superseded overview contracts", () => {
  const builderGlass = source("src/app/estimates/_components/estimate-builder-glass.css");
  const builderOperational = source(
    "src/app/estimates/_components/estimate-builder-operational.css"
  );
  const builderUi = source("src/app/estimates/_components/estimate-builder-ui.ts");
  const activeEstimateComposition = [
    source("src/app/estimates/[id]/estimate-detail-client.tsx"),
    source("src/app/estimates/_components/estimate-editor.tsx"),
    source("src/app/estimates/new/new-estimate-editor.tsx"),
  ].join("\n");

  assert.doesNotMatch(builderGlass, /--overview-scroll-y|is-scroll-nudge/);
  assert.doesNotMatch(builderGlass, /eb-line-pricing-grid/);
  assert.doesNotMatch(builderOperational, /eb-pricing-summary-detail-grid/);
  assert.doesNotMatch(builderUi, /overviewStickyAside|overviewStickyFloating/);
  assert.doesNotMatch(activeEstimateComposition, /useEstimateOverviewScrollMotion/);
  assert.doesNotMatch(activeEstimateComposition, /EstimateHeader/);
  assert.doesNotMatch(activeEstimateComposition, /EstimateLineItemRow/);
  assert.doesNotMatch(activeEstimateComposition, /EstimateSummarySidebar/);
});
