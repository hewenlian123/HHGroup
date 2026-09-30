import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("estimate section dialogs use shared card and control chrome", () => {
  const menu = source("src/app/estimates/_components/estimate-section-title-menu.tsx");
  assert.match(menu, /Add section/);
  assert.match(menu, /Rename section/);
  assert.match(menu, /rounded-card/);
  assert.doesNotMatch(
    menu,
    /rounded-sm border-border\/60|className="h-8 rounded-sm|className="text-base"/
  );
  assert.match(menu, /createCustomEstimateCategoryAction/);
});

test("estimate popovers and convert form drop leftover zinc and black buttons", () => {
  const drawer = source("src/app/estimates/[id]/convert-to-project-drawer.tsx");
  const controls = source("src/app/estimates/_components/estimate-details-drawer-controls.tsx");
  const editor = source("src/app/estimates/_components/estimate-editor.tsx");
  const payments = source("src/app/estimates/_components/estimate-payment-schedule.tsx");

  assert.match(drawer, /EB\.btnPrimary/);
  assert.doesNotMatch(drawer, /bg-foreground|text-destructive|bg-muted/);
  assert.match(drawer, /convertToProjectWithSetupAction/);
  assert.doesNotMatch(controls, /border-white\/\[0\.08\]|bg-white\/\[0\.08\]/);
  assert.match(controls, /discountAmountFromPercent/);
  assert.doesNotMatch(editor, /text-zinc-|border-white\/\[0\.06\]/);
  assert.match(payments, /data-testid="payment-template-save-dialog"/);
  assert.match(payments, /rounded-card/);
  assert.doesNotMatch(payments, /text-xs font-medium text-muted-foreground/);
});
