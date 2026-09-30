import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("labor lists use the live list frame and workspace title", () => {
  const files = [
    "src/app/labor/labor-page-client.tsx",
    "src/app/labor/worker-balances/page.tsx",
    "src/app/labor/payments/page.tsx",
    "src/app/labor/payroll/page.tsx",
    "src/app/labor/payroll-summary/page.tsx",
    "src/app/labor/workers/page.tsx",
    "src/app/labor/review/review-client.tsx",
    "src/app/labor/advances/worker-advances-client.tsx",
    "src/app/labor/worker-invoices/worker-invoices-client.tsx",
    "src/app/labor/invoices/page.tsx",
    "src/app/projects/[id]/labor/page.tsx",
  ].map(source);
  for (const file of files) {
    assert.match(file, /hh-list-frame|frame="list"/);
    assert.match(file, /variant="workspace"/);
    assert.match(file, /formatOverviewMoney/);
    assert.doesNotMatch(file, /max-w-\[430px\]/);
    assert.doesNotMatch(file, /formatCurrency\(/);
  }
});

test("project labor tables use the live card instead of the airtable frame", () => {
  const projectLabor = source("src/app/projects/[id]/labor/page.tsx");
  assert.match(projectLabor, /sectionCardClass/);
  assert.doesNotMatch(projectLabor, /airtable-table-wrap/);
});
