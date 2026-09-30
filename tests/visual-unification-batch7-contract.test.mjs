import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("labor entry dialogs use the live card and brass primary", () => {
  const files = [
    "src/app/labor/add-daily-entry-modal.tsx",
    "src/app/labor/edit-entry-modal.tsx",
    "src/app/labor/advances/worker-advance-form-dialog.tsx",
    "src/app/labor/payroll/pay-worker-modal.tsx",
    "src/app/labor/payroll/record-payment-modal.tsx",
  ].map(source);

  for (const file of files) {
    assert.match(file, /rounded-card/);
    assert.match(file, /text-\[var\(--hh-ink\)\]/);
    assert.doesNotMatch(file, /bg-\[var\(--hh-action-primary\)\]/);
    assert.doesNotMatch(file, /bg-foreground/);
    assert.doesNotMatch(file, /formatCurrency\(/);
  }

  assert.match(source("src/app/labor/add-daily-entry-modal.tsx"), /formatOverviewMoney/);
  assert.match(source("src/app/labor/edit-entry-modal.tsx"), /formatOverviewMoney/);
});

test("worker balance detail uses the list frame and overview money", () => {
  const page = source("src/app/labor/workers/[id]/balance/page.tsx");
  assert.match(page, /hh-list-frame/);
  assert.match(page, /text-title-page/);
  assert.match(page, /formatOverviewMoney/);
  assert.match(page, /rounded-card/);
  assert.doesNotMatch(page, /formatCurrency\(/);
  assert.doesNotMatch(page, /page-shell-wide/);
  assert.doesNotMatch(page, /bg-\[var\(--hh-action-primary\)\]/);
});
