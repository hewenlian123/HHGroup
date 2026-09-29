import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("AP bills pages use the live list frame and workspace title", () => {
  const pages = [
    "src/app/bills/page.tsx",
    "src/app/bills/loading.tsx",
    "src/app/bills/new/page.tsx",
    "src/app/bills/[id]/page.tsx",
    "src/app/bills/[id]/edit/page.tsx",
  ].map(source);
  for (const file of pages) {
    assert.match(file, /frame="list"/);
    assert.match(file, /variant="workspace"/);
  }
});

test("AP bills money, cards, and primary actions follow the live system", () => {
  const styles = source("src/app/bills/bills-ui-styles.ts");
  const list = source("src/app/bills/bills-list-client.tsx");
  const detail = source("src/app/bills/[id]/bill-detail-client.tsx");
  assert.match(styles, /sectionCardClass/);
  assert.match(styles, /hh-btn-primary/);
  assert.doesNotMatch(styles, /bg-\[var\(--hh-action-primary\)\]/);
  assert.doesNotMatch(styles, /max-w-\[1000px\]/);
  for (const file of [list, detail]) {
    assert.match(file, /formatOverviewMoney/);
    assert.match(file, /sectionCardClass/);
    assert.doesNotMatch(file, /formatCurrency/);
  }
  assert.match(list, /variant="workspace"/);
});
