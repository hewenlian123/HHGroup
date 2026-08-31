import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Figma Round 1.1 final tokens own the pure-white light system", () => {
  const tokens = source("src/styles/hh-design-system-v2.css");
  const globals = source("src/app/globals.css");

  for (const [name, value] of [
    ["canvas", "#f7f7f8"],
    ["workspace", "#ffffff"],
    ["section", "#fafafb"],
    ["hover", "#f4f4f5"],
    ["selected", "#eef4ff"],
    ["text-primary", "#181a1e"],
    ["text-secondary", "#4b525c"],
    ["text-muted", "#6b7280"],
    ["accent", "#2563eb"],
    ["accent-hover", "#1d4ed8"],
  ]) {
    assert.match(tokens, new RegExp(`--hh-v2-${name}: ${value}`));
  }

  assert.match(tokens, /--hh-type-page-title-font-size: 24px/);
  assert.match(tokens, /--hh-type-page-title-line-height: 30px/);
  assert.match(tokens, /--hh-type-table-cell-font-size: 13px/);
  assert.match(tokens, /--hh-type-table-cell-line-height: 18px/);
  assert.match(tokens, /--hh-type-financial-total-font-size: 20px/);
  assert.match(tokens, /--hh-type-financial-total-line-height: 24px/);
  assert.match(tokens, /--hh-control-height-standard: 36px/);
  assert.match(tokens, /--hh-row-height-standard: 40px/);
  assert.match(tokens, /--hh-sidebar-width-expanded: 216px/);
  assert.match(tokens, /--hh-sidebar-width-collapsed: 72px/);
  assert.match(tokens, /--hh-radius-row: 4px/);
  assert.match(tokens, /--hh-radius-control: 6px/);
  assert.match(tokens, /--hh-radius-card: 8px/);
  assert.ok(
    globals.indexOf('@import "../styles/design-tokens.generated.css"') <
      globals.indexOf('@import "../styles/hh-design-system-v2.css"'),
    "the Figma v2 layer must override, not rewrite, the generated compatibility file"
  );
});

test("Global Shell is light-only while route and navigation behavior remain composed", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  const sidebar = source("src/components/layout/sidebar.tsx");
  const topbar = source("src/components/layout/topbar.tsx");
  const operationalTheme = source("src/lib/operational-theme.ts");

  assert.match(shell, /: "operational-light"/);
  assert.doesNotMatch(shell, /operationalThemeMode|onToggleOperationalTheme/);
  assert.match(sidebar, /before:w-\[3px\][^"\n]*before:bg-\[var\(--hh-accent-primary\)\]/);
  assert.match(sidebar, /lg:h-9 lg:min-h-9/);
  assert.match(topbar, /h-14 min-h-14/);
  assert.doesNotMatch(topbar, /data-operational-theme-toggle|<Moon|<Sun/);
  assert.match(operationalTheme, /root\.classList\.remove\("dark"\)/);
  assert.match(operationalTheme, /root\.classList\.add\("light"\)/);
});

test("Estimate Workspace reuses the complete Global Sidebar and only integrates the content shell", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  const sidebar = source("src/components/layout/sidebar.tsx");
  const globals = source("src/app/globals.css");

  assert.match(shell, /data-integrated-estimate-workspace/);
  assert.match(shell, /integratedEstimateWorkspace=\{integratedEstimateWorkspace\}/);
  assert.match(sidebar, /HH_PROJECT_OS_NAV_SECTIONS\.map/);
  assert.match(sidebar, /data-sidebar-navigation/);
  assert.doesNotMatch(sidebar, /FIGMA_ESTIMATE_NAV_ITEMS|Estimate workspace navigation/);
  assert.match(
    globals,
    /data-integrated-estimate-workspace="true"\] \[data-app-topbar\][^{]*\{[^}]*display: none/s
  );
  assert.doesNotMatch(
    globals,
    /data-sidebar-figma-navigation|data-sidebar-navigation\][^{]*display: none/
  );
});

test("Estimate List keeps business-owned columns inside the Figma dense-table presentation", () => {
  const list = source("src/app/estimates/estimates-list-client.tsx");
  const row = source("src/app/estimates/estimate-list-row.tsx");
  const css = source("src/app/estimates/estimate-list-operational.css");

  assert.match(list, /<TableShell/);
  for (const label of [
    "Estimate",
    "Customer / Project",
    "Revision",
    "Status",
    "Total",
    "Updated",
  ]) {
    assert.match(list, new RegExp(`>\\s*${label.replace("/", "\\/")}\\s*<`));
  }
  assert.match(row, /<FinancialText/);
  assert.match(row, /showDot=\{false\}/);
  assert.match(css, /\.estimate-list-table tbody td\s*\{[^}]*height: 40px/s);
  assert.match(css, /outline: 2px solid var\(--hh-focus-ring\)/);
  assert.match(css, /box-shadow: inset 3px 0 0 var\(--hh-accent-primary\)/);
});

test("Estimate Workspace renders the validated 104 / 176 / 360 desktop shell", () => {
  const editor = source("src/app/estimates/_components/estimate-editor.tsx");
  const header = source("src/app/estimates/_components/estimate-workspace-command-header.tsx");
  const sectionOutline = source("src/app/estimates/_components/estimate-section-outline.tsx");
  const scopeToolbar = source("src/app/estimates/_components/estimate-scope-toolbar.tsx");
  const localLineItems = source("src/app/estimates/_components/estimate-line-items-local.tsx");
  const newEditor = source("src/app/estimates/new/new-estimate-editor.tsx");
  const workflowContinuity = source(
    "src/app/estimates/_components/estimate-workflow-continuity.ts"
  );
  const css = source("src/app/estimates/_components/estimate-builder-operational.css");

  assert.match(editor, /<EstimateSectionOutline/);
  assert.match(editor, /<EstimateBuilderCompactSummary/);
  assert.match(header, /<StatusBadge/);
  assert.match(header, /showDot=\{false\}/);
  assert.match(css, /\.estimate-builder-new \.eb-estimate-command-bar\s*\{[^}]*min-height: 104px/s);
  assert.match(css, /grid-template-columns: 176px minmax\(0, 1fr\) 360px/);
  assert.match(css, /grid-column: 1 \/ -1 !important/);
  assert.match(css, /background: var\(--hh-surface-workspace\)/);
  assert.match(css, /\.eb-section-outline-row\.is-active\s*\{[^}]*--hh-surface-selected/s);
  assert.match(
    editor,
    /data-estimate-editor-mode=\{isReadOnly \? "read" : "edit"\}[\s\S]*?data-estimate-active-section-id=\{selectedCategoryId \?\? undefined\}/
  );
  assert.match(
    editor,
    /<EstimateSectionOutline[\s\S]*?activeSectionId=\{selectedCategoryId\}[\s\S]*?onActiveSectionChange=\{handleActiveSectionChange\}/
  );
  assert.match(
    editor,
    /<EstimateScopeToolbar[\s\S]*?activeSectionId=\{selectedCategoryId\}[\s\S]*?onActiveSectionChange=\{handleActiveSectionChange\}/
  );
  assert.doesNotMatch(sectionOutline, /data-estimate-active-section-id/);
  assert.doesNotMatch(scopeToolbar, /data-estimate-active-section-id/);
  assert.match(
    localLineItems,
    /<EstimateScopeToolbar[\s\S]*?activeSectionId=\{activeSectionId\}[\s\S]*?explicitActiveSectionId=\{explicitActiveSectionId\}[\s\S]*?onActiveSectionChange=\{onActiveSectionChange\}/
  );
  assert.match(
    newEditor,
    /data-estimate-editor-mode="new"[\s\S]*?data-estimate-active-section-id=\{selectedSectionId \?\? undefined\}/
  );
  assert.match(
    newEditor,
    /<EstimateSectionOutline[\s\S]*?activeSectionId=\{selectedSectionId\}[\s\S]*?onActiveSectionChange=\{handleActiveSectionChange\}/
  );
  assert.match(
    newEditor,
    /<EstimateLineItemsLocal[\s\S]*?activeSectionId=\{selectedSectionId\}[\s\S]*?explicitActiveSectionId=\{explicitActiveSectionId\}[\s\S]*?onActiveSectionChange=\{handleActiveSectionChange\}/
  );
  assert.match(
    workflowContinuity,
    /querySelector<HTMLElement>\(\s*"\[data-estimate-editor-mode\]\[data-estimate-active-section-id\]"\s*\)/
  );
});

test("Status badge and portrait line-item density use the Figma v2 contract", () => {
  const statusBadge = source("src/components/base/status-badge.tsx");
  const header = source("src/app/estimates/_components/estimate-workspace-command-header.tsx");
  const css = source("src/app/estimates/_components/estimate-builder-operational.css");
  const tokens = source("src/styles/hh-design-system-v2.css");
  const portraitGridToken =
    "--eb-estimate-line-grid: var(--hh-grid-template-estimate-line-portrait)";
  const portraitGridTokenIndex = css.indexOf(portraitGridToken);
  const portraitStart = css.lastIndexOf(
    "@media (min-width: 768px) and (max-width: 1199px)",
    portraitGridTokenIndex
  );
  const portraitRules = css.slice(
    portraitStart,
    css.indexOf("@media (min-width: 1200px)", portraitStart)
  );

  assert.match(statusBadge, /h-\[26px\].*rounded-hh-pill.*text-hh-status/s);
  assert.match(tokens, /--hh-radius-pill: 999px/);
  assert.doesNotMatch(header, /className="h-\[26px\]/);
  assert.match(header, /if \(status === "Sent"\) return \{ label: "Sent", variant: "info" \}/);
  assert.match(tokens, /--hh-row-height-portrait-grid-header: 44px/);
  assert.match(tokens, /--hh-row-height-portrait-line-item: 52px/);
  assert.match(tokens, /--hh-grid-template-estimate-line-portrait:/);
  assert.match(tokens, /--hh-grid-template-estimate-line-portrait:[^;]*var\(--hh-touch-min\)/);
  assert.match(
    css,
    /@media \(min-width: 768px\)\s*\{[\s\S]*?\.eb-line-item-grid-header,[\s\S]*?\.eb-line-item-grid--pricing\s*\{[^}]*grid-template-columns: var\(--eb-estimate-line-grid\)/
  );
  assert.match(
    portraitRules,
    /--eb-estimate-line-grid: var\(--hh-grid-template-estimate-line-portrait\)/
  );
  assert.match(portraitRules, /--eb-estimate-line-gap: var\(--hh-space-2\)/);
  assert.match(portraitRules, /height: var\(--hh-row-height-portrait-grid-header\)/);
  assert.match(portraitRules, /height: var\(--hh-row-height-portrait-line-item\)/);
  assert.match(portraitRules, /border-radius: var\(--hh-radius-card\)/);
  assert.doesNotMatch(portraitRules, /(?:height|min-height): (?:44|52)px/);
  assert.doesNotMatch(portraitRules, /border-radius: 8px/);
});
