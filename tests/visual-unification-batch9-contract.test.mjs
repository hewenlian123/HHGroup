import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("worker reimbursements use the list frame and overview money", () => {
  const page = source("src/app/labor/reimbursements/page.tsx");
  assert.match(page, /hh-list-frame/);
  assert.match(page, /variant="workspace"/);
  assert.match(page, /formatOverviewMoney/);
  assert.match(page, /rounded-card/);
  assert.doesNotMatch(page, /page-shell-wide/);
  assert.doesNotMatch(page, /formatCurrency\(/);
  assert.doesNotMatch(page, /!max-w-none/);
});

test("labor invoice list, detail, and new use section cards", () => {
  for (const path of [
    "src/app/labor/invoices/page.tsx",
    "src/app/labor/invoices/[id]/page.tsx",
    "src/app/labor/invoices/new/page.tsx",
  ]) {
    const page = source(path);
    assert.match(page, /hh-list-frame/);
    assert.match(page, /sectionCardClass/);
    assert.doesNotMatch(page, /border-gray-/);
    assert.doesNotMatch(page, /text-zinc-/);
  }
  assert.match(source("src/app/labor/invoices/[id]/page.tsx"), /formatOverviewMoney/);
  assert.doesNotMatch(source("src/app/labor/invoices/[id]/page.tsx"), /formatCurrency\(/);
});

test("labor receipt screen and statement paper keep their document roots", () => {
  const receipt = source("src/app/labor/payments/[id]/receipt/receipt-screen-client.tsx");
  assert.match(receipt, /receipt-print-shell/);
  assert.match(receipt, /data-hh-context="document-route"/);
  assert.match(receipt, /text-\[var\(--hh-link\)\]/);
  assert.doesNotMatch(receipt, /zinc-/);

  const print = source("src/app/workers/[id]/statement/print/page.tsx");
  assert.match(print, /payroll-statement-print-root/);
  assert.match(print, /data-hh-context="document-route"/);
  assert.match(print, /rounded-card/);
  assert.doesNotMatch(print, /zinc-/);
  assert.doesNotMatch(print, /emerald-/);
  assert.doesNotMatch(print, /rose-/);

  const statement = source("src/app/workers/[id]/statement/page.tsx");
  assert.match(statement, /frame="list"/);
  assert.match(statement, /variant="workspace"/);
  assert.match(statement, /sectionCardClass/);
  assert.doesNotMatch(statement, /rounded-2xl/);
  assert.doesNotMatch(statement, /tracking-\[0\.06em\]/);
});
