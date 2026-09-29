import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("subcontract bills and the payment dialog use the live list frame", () => {
  const bills = source("src/app/projects/[id]/subcontracts/[subId]/bills/page.tsx");
  const payment = source("src/app/projects/[id]/subcontracts/[subId]/bills/bill-row-actions.tsx");
  const addBill = source("src/app/projects/[id]/subcontracts/[subId]/bills/add-bill-modal.tsx");
  assert.match(bills, /frame="list"/);
  assert.match(bills, /variant="workspace"/);
  assert.match(bills, /formatOverviewMoney/);
  assert.match(bills, /sectionCardClass/);
  assert.doesNotMatch(bills, /airtable-table-wrap/);
  assert.match(payment, /formatOverviewMoney/);
  assert.match(payment, /sectionCardClass/);
  assert.doesNotMatch(addBill, /bg-foreground/);
});

test("subcontractor directory uses the live list frame and overview money", () => {
  const list = source("src/app/subcontractors/page.tsx");
  const rows = source("src/app/subcontractors/subcontractors-list-client.tsx");
  const detail = source("src/app/subcontractors/[id]/page.tsx");
  for (const file of [list, detail]) {
    assert.match(file, /frame="list"/);
    assert.match(file, /variant="workspace"/);
  }
  assert.match(rows, /variant="workspace"/);
  assert.match(rows, /formatOverviewMoney/);
  assert.match(detail, /formatOverviewMoney/);
  assert.match(detail, /sectionCardClass/);
  assert.doesNotMatch(`${rows}\n${detail}`, /toLocaleString\("en-US"/);
});

test("closeout and commission forms use live cards instead of flat brass fills", () => {
  const closeout = source("src/app/projects/[id]/project-closeout-tab.tsx");
  const projectCommission = source("src/app/projects/[id]/project-commission-tab.tsx");
  const commissions = source("src/app/financial/commissions/commissions-client.tsx");
  for (const file of [closeout, projectCommission, commissions]) {
    assert.match(file, /sectionCardClass/);
    assert.match(file, /formatOverviewMoney/);
    assert.doesNotMatch(file, /bg-\[var\(--hh-action-primary\)\]/);
    assert.doesNotMatch(file, /airtable-table-wrap/);
  }
  assert.match(commissions, /hh-list-frame/);
  assert.match(commissions, /variant="workspace"/);
  assert.doesNotMatch(commissions, /max-w-\[430px\]/);
});

test("estimate command chrome uses brass for the primary action and keeps the paper title lock", () => {
  const header = source("src/app/estimates/_components/estimate-workspace-command-header.tsx");
  assert.match(header, /hh-btn-primary/);
  assert.match(header, /text-\[var\(--hh-link\)\]/);
  assert.match(header, /eb-estimate-command-title[^"\n]*text-\[24px\]/);
  assert.doesNotMatch(header, /--hh-accent-primary/);
});
