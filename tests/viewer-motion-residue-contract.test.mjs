import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("viewer chrome keeps the operational-light token boundary without dark glass or gold residue", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  assert.match(shell, /viewerRoute\s*\?\s*"operational-light"/);

  for (const path of [
    "src/components/attachment-preview-modal.tsx",
    "src/components/receipt-viewer/receipt-viewer-dialog.tsx",
    "src/components/labor/worker-payment-receipt-preview-modal.tsx",
    "src/app/financial/expenses/expense-receipt-preview-dialog.tsx",
    "src/app/financial/expenses/expense-inbox-preview-modal.tsx",
  ]) {
    const viewer = source(path);
    assert.doesNotMatch(
      viewer,
      /neo-dark|backdrop-blur|backdrop-filter|#d2b77f|184_137_45|bg-\[#07090d\]/
    );
  }
});

test("mobile AR has one primary action and shared controls avoid unbounded transitions", () => {
  const hideGate = source("src/lib/floating-fab-visibility.ts");
  assert.match(hideGate, /"\/financial\/ar"/);

  for (const path of [
    "src/app/projects/projects-client.tsx",
    "src/components/projects/project-form-controls.tsx",
    "src/lib/native-field-classes.ts",
    "src/components/charts/simple-bar-chart.tsx",
  ]) {
    assert.doesNotMatch(source(path), /transition-all/);
  }
});

test("superseded financial and estimate component modules have no route artifact", () => {
  for (const path of [
    "src/app/financial/financial-client.tsx",
    "src/app/estimates/[id]/estimate-header.tsx",
    "src/app/estimates/[id]/estimate-summary-sidebar.tsx",
  ]) {
    assert.equal(existsSync(resolve(root, path)), false, `${path} must be removed`);
  }
});
