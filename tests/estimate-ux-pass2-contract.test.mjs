import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("tax preset name uses a dialog instead of the browser prompt", () => {
  const controls = source("src/app/estimates/_components/estimate-details-drawer-controls.tsx");
  assert.match(controls, /Save tax preset/);
  assert.match(controls, /appendCustomEstimateTaxPreset/);
  assert.match(controls, /discountAmountFromPercent/);
  assert.doesNotMatch(controls, /window\.prompt/);
  assert.doesNotMatch(controls, />No discount</);
  assert.match(controls, /Clear discount/);
});

test("section and payment entry points stay, with clearer steps", () => {
  const menu = source("src/app/estimates/_components/estimate-section-title-menu.tsx");
  const payments = source("src/app/estimates/_components/estimate-payment-schedule.tsx");
  assert.match(menu, /Move this section/);
  assert.match(menu, /\+ Add section/);
  assert.match(menu, /Rename section/);
  assert.match(menu, /createCustomEstimateCategoryAction/);
  assert.match(payments, /data-testid="payment-template-save-dialog"/);
  assert.match(payments, /data-testid="payment-template-replace"/);
  assert.match(payments, /data-testid="payment-template-merge"/);
  assert.match(payments, /Replace schedule/);
  assert.match(payments, /Merge into schedule/);
});

test("line-item fill-in no longer shrinks to 32px and portal primary is brass", () => {
  const builderUi = source("src/app/estimates/_components/estimate-builder-ui.ts");
  const editor = source("src/app/estimates/_components/estimate-editor.tsx");
  const localLines = source("src/app/estimates/_components/estimate-line-items-local.tsx");
  const operational = source("src/app/estimates/_components/estimate-builder-operational.css");

  assert.match(builderUi, /md:h-hh-control-standard/);
  assert.doesNotMatch(builderUi, /md:h-8 md:min-h-8 md:px-2\.5/);
  assert.doesNotMatch(builderUi, /!bg-foreground !text-background/);
  assert.match(builderUi, /!bg-\[var\(--hh-brass\)\]/);
  assert.doesNotMatch(editor, /ebInput\(`h-8 min-h-8/);
  assert.doesNotMatch(localLines, /h-8 min-h-8 w-full px-2/);
  assert.match(
    operational,
    /\.eb-line-item-grid--pricing input\.eb-input \{[\s\S]*?height: var\(--hh-control-height-standard\) !important;/
  );
});
