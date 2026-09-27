import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("customer-facing Estimate totals preserve the financial field contract", () => {
  const summary = read("src/app/estimates/_components/estimate-builder-summary.tsx");
  const calculations = read("src/lib/estimates-db.ts");
  const totals = read("src/lib/estimate-totals.ts");

  for (const label of ["Subtotal", "Discount", "Tax", "Total", "Scheduled", "Remaining"]) {
    assert.match(summary, new RegExp(`>${label}<|label=\\"${label}\\"`));
  }
  assert.match(calculations, /taxRatePct: meta\.taxRatePct/);
  assert.match(calculations, /total: pricing\.total/);
  assert.match(totals, /const taxableBase = roundMoney\(Math\.max\(0, subtotal - discount\)\)/);
  assert.match(totals, /roundMoney\(taxableBase \* \(taxRatePct \/ 100\)\)/);
  assert.match(totals, /total: roundMoney\(subtotal - discount \+ tax\)/);
});

test("customer details do not edit retired internal planning fields", () => {
  const details = read("src/app/estimates/_components/estimate-edit-customer-section.tsx");

  assert.doesNotMatch(details, /name="overheadPct"/);
  assert.doesNotMatch(details, /name="profitPct"/);
  assert.match(details, /name="tax"/);
  assert.match(details, /name="discount"/);
});
