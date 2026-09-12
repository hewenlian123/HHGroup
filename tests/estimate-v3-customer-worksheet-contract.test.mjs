// PRESENTATION SNAPSHOT: task-scoped evidence for the current implementation only.
// Explicit user-requested redesign may replace or retire these presentation assertions.
// This file is not permanent UI authority.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the current Estimate snapshot mounts one customer-facing worksheet", () => {
  const existingEditor = read("src/app/estimates/_components/estimate-editor.tsx");
  const newEditor = read("src/app/estimates/new/new-estimate-editor.tsx");

  assert.doesNotMatch(existingEditor, /EstimateSectionOutline/);
  assert.doesNotMatch(newEditor, /EstimateSectionOutline/);
  assert.match(existingEditor, /eb-estimate-workbench--v3/);
  assert.match(newEditor, /eb-estimate-workbench--v3/);
});

test("Estimate exposes customer totals and payment reconciliation", () => {
  const summary = read("src/app/estimates/_components/estimate-builder-summary.tsx");

  for (const label of ["Subtotal", "Discount", "Tax", "Total", "Scheduled", "Remaining"]) {
    assert.match(summary, new RegExp(`>${label}<|label=\\"${label}\\"`));
  }
  assert.doesNotMatch(summary, /showInternal/);
  assert.doesNotMatch(summary, /Estimate price allocation/);
  assert.doesNotMatch(summary, /No internal costs/);
  assert.doesNotMatch(summary, /label="(?:Material|Labor|Subcontract(?:or)?)"/);
});

test("Estimate details do not edit retired internal planning fields", () => {
  const details = read("src/app/estimates/_components/estimate-edit-customer-section.tsx");

  assert.doesNotMatch(details, /name="overheadPct"/);
  assert.doesNotMatch(details, /name="profitPct"/);
  assert.doesNotMatch(details, /Internal overhead/);
  assert.doesNotMatch(details, /Internal profit/);
  assert.match(details, /name="tax"/);
  assert.match(details, /name="discount"/);
});

test("the current desktop worksheet names every customer quote field", () => {
  const header = read("src/app/estimates/_components/estimate-line-item-grid-header.tsx");

  for (const label of [
    "Item Name",
    "Description",
    "Qty",
    "Unit",
    "Unit price",
    "Line total",
    "More",
  ]) {
    assert.match(header, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(header, />Item details</);
  assert.doesNotMatch(header, />Qty \/ Unit</);
});

test("the current Estimate snapshot places payment and terms after the worksheet", () => {
  for (const path of [
    "src/app/estimates/_components/estimate-editor.tsx",
    "src/app/estimates/new/new-estimate-editor.tsx",
  ]) {
    const editor = read(path);
    const worksheet = editor.indexOf('className="eb-v3-worksheet-flow"');
    const payment = editor.indexOf('id="estimate-payment-schedule"', worksheet);
    const notes = editor.indexOf('id="estimate-terms-notes"', payment);

    assert.ok(worksheet >= 0, `${path} must mount the V3 worksheet flow`);
    assert.ok(payment > worksheet, `${path} must place payment after the worksheet`);
    assert.ok(notes > payment, `${path} must place terms and notes after payment`);
  }
});

test("the current desktop snapshot aligns quote fields", () => {
  const css = read("src/app/estimates/_components/estimate-builder-operational.css");
  const v3Cascade = css.slice(css.indexOf("HH Group Estimate V3"));

  assert.match(v3Cascade, /grid-template-columns:\s*minmax\(0, 1fr\) 360px !important/);
  assert.doesNotMatch(v3Cascade, /176px/);
  assert.match(v3Cascade, /\.eb-line-pricing-qty\s*\{\s*grid-column: 4/);
  assert.match(v3Cascade, /\.eb-line-pricing-measure\s*\{\s*grid-column: 5/);
  assert.match(v3Cascade, /\.eb-line-pricing-unit\s*\{\s*grid-column: 6/);
  assert.match(v3Cascade, /\.eb-line-total-block\s*\{\s*grid-column: 7/);
  assert.match(v3Cascade, /\.eb-line-item-more-trigger\s*\{\s*grid-column: 8/);
});
