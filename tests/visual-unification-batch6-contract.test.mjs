import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("settings layout owns one list frame for the whole section", () => {
  const layout = source("src/app/settings/layout.tsx");
  const nav = source("src/components/settings/settings-sub-nav.tsx");
  assert.match(layout, /hh-list-frame/);
  assert.match(layout, /bg-\[var\(--hh-l0-canvas\)\]/);
  assert.doesNotMatch(layout, /bg-workspace/);
  assert.match(nav, /hh-filters-bar/);
  assert.doesNotMatch(nav, /page-container/);
});

test("settings pages sit inside the section frame with workspace titles", () => {
  const pages = [
    "src/app/settings/account/page.tsx",
    "src/app/settings/company/page.tsx",
    "src/app/settings/expenses/page.tsx",
    "src/app/settings/security/page.tsx",
    "src/app/settings/users/page.tsx",
    "src/app/settings/permissions/page.tsx",
    "src/app/settings/categories/page.tsx",
    "src/app/settings/lists/page.tsx",
    "src/app/settings/subcontractors/page.tsx",
    "src/app/settings/project-financial-review/page.tsx",
  ].map(source);

  for (const file of pages) {
    assert.match(file, /variant="workspace"/);
    assert.doesNotMatch(file, /page-container/);
    assert.doesNotMatch(file, /max-w-\[960px\]/);
    assert.doesNotMatch(file, /max-w-\[430px\]/);
  }

  for (const file of pages.filter((file) => file.includes("PageLayout"))) {
    assert.match(file, /frame="embedded"/);
  }
});

test("settings form cards use the live section card", () => {
  const files = [
    "src/app/settings/account/page.tsx",
    "src/app/settings/company/page.tsx",
    "src/app/settings/expenses/page.tsx",
    "src/app/settings/security/security-client.tsx",
    "src/app/settings/users/page.tsx",
    "src/app/settings/permissions/page.tsx",
    "src/app/settings/categories/page.tsx",
    "src/app/settings/lists/page.tsx",
    "src/app/settings/subcontractors/subcontractors-table-client.tsx",
    "src/app/settings/project-financial-review/page.tsx",
  ].map(source);
  for (const file of files) {
    assert.match(file, /sectionCardClass/);
  }
  const review = source("src/app/settings/project-financial-review/page.tsx");
  assert.match(review, /formatOverviewMoney/);
  assert.doesNotMatch(review, /toLocaleString/);
});
