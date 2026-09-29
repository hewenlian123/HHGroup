import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("list frame is opt-in and the default page column stays", () => {
  const layout = source("src/components/base/page-layout.tsx");
  assert.match(layout, /page-container page-stack[^"\n]*bg-\[var\(--hh-l0-canvas\)\]/);
  assert.match(layout, /frame === "list"[\s\S]*hh-list-frame/);
});

test("change orders, subcontracts, and client reimbursements use the live list frame", () => {
  const orders = source("src/app/change-orders/change-orders-view.tsx");
  const detail = source("src/app/projects/[id]/change-orders/[coId]/page.tsx");
  const created = source("src/app/projects/[id]/change-orders/new/page.tsx");
  const contracts = source("src/app/projects/[id]/subcontracts/page.tsx");
  const contractDetail = source("src/app/projects/[id]/subcontracts/[subId]/page.tsx");
  const reimbursements = source(
    "src/app/financial/client-reimbursements/client-reimbursements-client.tsx"
  );
  for (const file of [orders, detail, contracts, contractDetail]) {
    assert.match(file, /frame="list"/);
    assert.match(file, /variant="workspace"/);
    assert.match(file, /formatOverviewMoney/);
  }
  assert.match(created, /hh-list-frame/);
  assert.doesNotMatch(created, /page-container/);
  assert.match(reimbursements, /variant="workspace"/);
  assert.match(reimbursements, /formatOverviewMoney/);
  assert.match(reimbursements, /sectionCardClass/);
  assert.doesNotMatch(
    source("src/lib/client-reimbursement-pdf.ts"),
    /hh-list-frame|text-title-page/
  );
});

test("project subpanels do not use brass as warning or link text", () => {
  const tabs = source("src/app/projects/[id]/project-detail-tabs-client.tsx");
  const comparison = source(
    "src/app/projects/[id]/project-financial-snapshot-comparison-panel.tsx"
  );
  assert.doesNotMatch(tabs, /text-\[var\(--hh-action-primary\)\]/);
  assert.doesNotMatch(comparison, /text-\[var\(--hh-action-primary\)\]/);
  assert.match(tabs, /sectionCardClass/);
  assert.match(tabs, /formatOverviewMoney/);
});
