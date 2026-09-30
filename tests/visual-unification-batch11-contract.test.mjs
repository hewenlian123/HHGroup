import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Operations Home uses the shared list frame, cards, and overview money", () => {
  const page = source("src/app/dashboard/page.tsx");
  const loading = source("src/app/dashboard/loading.tsx");
  const header = source("src/app/dashboard/dashboard-page-header.tsx");
  const hud = source("src/app/dashboard/dashboard-command-hud.tsx");
  const skeleton = source("src/app/dashboard/dashboard-skeletons.tsx");
  const actions = source("src/app/dashboard/dashboard-quick-actions.tsx");
  const main = source("src/app/dashboard/dashboard-main-section.tsx");

  for (const file of [page, loading]) {
    assert.match(file, /hh-list-frame/);
    assert.match(file, /bg-\[var\(--hh-l0-canvas\)\]/);
    assert.doesNotMatch(file, /page-shell-wide|page-container/);
  }

  assert.match(header, /text-title-page text-\[var\(--hh-ink\)\]/);
  assert.match(header, /Operations Home/);
  assert.match(hud, /sectionCardClass/);
  assert.match(hud, /formatOverviewMoney/);
  assert.match(hud, /text-\[var\(--hh-link\)\]/);
  assert.match(hud, /Guarded project profit/);
  assert.match(hud, /Priority queue/);
  assert.match(hud, /Financial facts/);
  assert.match(hud, /upcomingTasks\.slice\(0, 3\)/);
  assert.match(hud, /projectHealthRows\.slice\(0, 4\)/);
  assert.match(hud, /recentActivity\.slice\(0, 4\)/);
  assert.match(hud, /marginPct\.toFixed\(1\)/);
  assert.match(hud, /recentRecords\.reduce/);
  assert.doesNotMatch(hud, /formatCurrency\(|formatCompactCurrency/);
  assert.doesNotMatch(hud, /--hh-action-primary/);
  assert.doesNotMatch(hud, /text-\[clamp/);
  assert.match(skeleton, /sectionCardClass/);
  assert.match(actions, /data-dashboard-primary-actions/);
  assert.match(actions, /Create invoice/);
  assert.doesNotMatch(actions, /dashboard-action-button/);
  assert.match(main, /formatCompactCurrency\(stats\.totalProfit\)/);
  assert.doesNotMatch(main, /formatOverviewMoney/);
});
