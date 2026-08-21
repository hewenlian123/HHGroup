import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("the legacy DataTable API delegates to one canonical responsive composition", () => {
  const compatibilityTable = source("src/components/data-table.tsx");
  const canonicalTable = source("src/components/base/data-table.tsx");

  assert.match(compatibilityTable, /DataTable as CanonicalDataTable/);
  assert.match(compatibilityTable, /<CanonicalDataTable/);
  assert.doesNotMatch(compatibilityTable, /<Table(?:\s|>)/);
  assert.match(canonicalTable, /tabIndex=\{onRowClick \? 0 : undefined\}/);
  assert.match(canonicalTable, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(canonicalTable, /aria-selected=\{isSelected \|\| undefined\}/);
  assert.match(canonicalTable, /busy=\{loading\}/);
});

test("table and mobile-list foundations own tokenized row states and keyboard focus", () => {
  const table = source("src/components/ui/table.tsx");
  const mobileRow = source("src/components/ui/mobile-list-row.tsx");

  assert.match(table, /scope=\{scope \?\? "col"\}/);
  assert.match(table, /hh-l3-selected/);
  assert.match(mobileRow, /hh-focus-ring/);
  assert.match(mobileRow, /hh-l3-hover/);
  assert.match(mobileRow, /hh-l3-pressed/);
  assert.doesNotMatch(mobileRow, /active:scale|hover:-translate/);
});

test("Neo data-display names are compatibility wrappers over canonical primitives", () => {
  const neo = source("src/components/base/neo-primitives.tsx");

  assert.match(neo, /<Panel/);
  assert.match(neo, /<Kpi/);
  assert.match(neo, /<CanonicalMobileListRow/);
  assert.match(neo, /<FinancialText/);
  assert.match(neo, /<StatusBadge/);
  assert.doesNotMatch(neo, /hover:-translate|active:scale/);
});

test("Card, Panel, KPI, and financial text consume approved shared roles", () => {
  const card = source("src/components/ui/card.tsx");
  const panel = source("src/components/ui/panel.tsx");
  const kpi = source("src/components/ui/kpi.tsx");
  const financialText = source("src/components/ui/financial-text.tsx");

  assert.match(card, /OS\.card/);
  assert.doesNotMatch(card, /hover:-translate|hover:scale/);
  assert.match(panel, /OS\.card/);
  assert.match(kpi, /TYPO\.kpiLabel/);
  assert.match(kpi, /TYPO\.kpiValue/);
  assert.match(financialText, /amountClass/);
  assert.match(financialText, /hh-fin/);
});

test("Badge and StatusBadge use semantic soft states with non-color context", () => {
  const badge = source("src/components/ui/badge.tsx");
  const status = source("src/components/base/status-badge.tsx");
  const globals = source("src/app/globals.css");

  for (const semantic of ["success", "warning", "information", "danger"]) {
    assert.match(badge, new RegExp(`--hh-${semantic}-soft-fill`));
    assert.match(badge, new RegExp(`--hh-${semantic}-border`));
    assert.match(badge, new RegExp(`--hh-${semantic}\\)`));
  }
  assert.match(status, /<Badge/);
  assert.match(status, /aria-hidden="true"/);
  assert.match(status, /\{label\}/);
  assert.doesNotMatch(status, /neo-gold|emerald-|rose-/);
  assert.match(globals, /\.hh-pill-success\s*\{[^}]*var\(--hh-success-soft-fill\)/s);
  assert.match(globals, /\.hh-pill-warning\s*\{[^}]*var\(--hh-warning-soft-fill\)/s);
});

test("shared amount tones retain FIN and use semantic financial state colors", () => {
  const typography = source("src/lib/typography.ts");

  assert.match(typography, /income:\s*"text-\[var\(--hh-success\)\]"/);
  assert.match(typography, /expense:\s*"text-\[var\(--hh-danger\)\]"/);
  assert.match(typography, /amount:\s*"hh-fin text-hh-financial/);
});
