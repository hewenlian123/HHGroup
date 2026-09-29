import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("tokens.css owns list frame, card radius, and the bottom-nav brass bar", () => {
  const tokens = source("src/styles/tokens.css");
  assert.match(tokens, /\.hh-list-frame\s*\{[^}]*max-width:\s*1200px/);
  assert.match(tokens, /\.hh-filters-bar\s*\{[^}]*border-radius:\s*var\(--hh-radius-xl\)/);
  assert.match(tokens, /\.hh-badge\s*\{[^}]*height:\s*22px/);
  assert.match(tokens, /--hh-brand-gold:\s*var\(--hh-brass\)/);
  assert.match(
    tokens,
    /nav\[aria-label="Bottom navigation"\][\s\S]*a\[aria-current="page"\]::before[\s\S]*var\(--hh-grad-brass\)/
  );
});

test("estimate surfaces do not rewrite global --hh tokens or portals", () => {
  const css = source("src/app/estimates/estimate-tokens.css");
  assert.doesNotMatch(css, /--hh-[a-z0-9-]+\s*:/);
  assert.doesNotMatch(css, /data-hh-portal-host/);
  assert.match(css, /--estimate-accent:/);
});

test("status badge and bottom nav leave active chrome to tokens.css", () => {
  const badge = source("src/components/base/status-badge.tsx");
  const bottomNav = source("src/components/layout/bottom-nav.tsx");
  const shell = source("src/components/layout/app-shell-visual.css");
  assert.doesNotMatch(badge, /h-\[26px\]/);
  assert.doesNotMatch(bottomNav, /bg-\[var\(--hh-surface-selected\)\]/);
  assert.doesNotMatch(shell, /\[data-app-bottom-nav\] a\[aria-current="page"\]/);
});

test("finance lists use the shared frame, workspace title, and U+2212 money", () => {
  const invoices = source("src/app/financial/invoices/invoices-list-client.tsx");
  const payments = source("src/app/financial/payments/page.tsx");
  const expenses = source("src/app/financial/expenses/expenses-client.tsx");
  const money = source("src/components/ui/money.tsx");
  for (const file of [invoices, payments]) {
    assert.match(file, /hh-list-frame/);
    assert.match(file, /variant="workspace"/);
    assert.doesNotMatch(file, /max-w-\[430px\]/);
  }
  assert.match(expenses, /variant="workspace"/);
  assert.match(money, /formatOverviewMoney/);
  assert.match(invoices, /formatOverviewMoney|<Money /);
});
