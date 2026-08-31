import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("generates the approved Phase 2 depth, border, and shadow tokens", () => {
  const css = source("src/styles/design-tokens.generated.css");

  for (const declaration of [
    "--hh-l3-hover: #f4f4f2;",
    "--hh-l3-selected: #ececea;",
    "--hh-l3-pressed: #e7e7e4;",
    "--hh-l4-floating-surface: #ffffff;",
    "--hh-l5-task-surface: #ffffff;",
    "--hh-shadow-operational: 0 1px 2px rgb(0 0 0 / 0.04);",
    "--hh-shadow-floating: 0 2px 8px -3px rgb(0 0 0 / 0.10), 0 22px 48px -18px rgb(0 0 0 / 0.22);",
    "--hh-shadow-task: 0 4px 12px -5px rgb(0 0 0 / 0.12), 0 34px 72px -26px rgb(0 0 0 / 0.28);",
  ]) {
    assert.ok(css.includes(declaration), `missing light declaration: ${declaration}`);
  }

  for (const declaration of [
    "--hh-l3-hover: #1c2029;",
    "--hh-l3-selected: rgb(198 165 106 / 10%);",
    "--hh-l3-pressed: rgb(198 165 106 / 20%);",
    "--hh-l4-floating-surface: #171b24;",
    "--hh-l5-task-surface: #171b24;",
    "--hh-shadow-operational: 0 1px 2px rgb(0 0 0 / 0.2);",
    "--hh-shadow-floating: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -1px rgb(0 0 0 / 0.2);",
    "--hh-shadow-task: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -2px rgb(0 0 0 / 0.3);",
  ]) {
    assert.ok(css.includes(declaration), `missing dark declaration: ${declaration}`);
  }
});

test("generates the approved Phase 5 focus and semantic soft-state tokens", () => {
  const css = source("src/styles/design-tokens.generated.css");

  for (const declaration of [
    "--hh-focus-ring: #c6a56a;",
    "--hh-success-soft-fill: rgb(22 129 91 / 10%);",
    "--hh-success-border: rgb(22 129 91 / 20%);",
    "--hh-warning-soft-fill: rgb(161 98 7 / 10%);",
    "--hh-warning-border: rgb(161 98 7 / 20%);",
    "--hh-information-soft-fill: rgb(37 99 168 / 10%);",
    "--hh-information-border: rgb(37 99 168 / 20%);",
    "--hh-danger-soft-fill: rgb(180 35 47 / 10%);",
    "--hh-danger-border: rgb(180 35 47 / 20%);",
  ]) {
    assert.ok(css.includes(declaration), `missing light declaration: ${declaration}`);
  }

  for (const declaration of [
    "--hh-focus-ring: #c6a56a;",
    "--hh-success-soft-fill: rgb(79 175 124 / 10%);",
    "--hh-success-border: rgb(79 175 124 / 20%);",
    "--hh-warning-soft-fill: rgb(245 158 11 / 10%);",
    "--hh-warning-border: rgb(245 158 11 / 20%);",
    "--hh-information-soft-fill: rgb(59 130 246 / 10%);",
    "--hh-information-border: rgb(59 130 246 / 20%);",
    "--hh-danger-soft-fill: rgb(239 68 68 / 10%);",
    "--hh-danger-border: rgb(239 68 68 / 20%);",
  ]) {
    assert.ok(css.includes(declaration), `missing dark declaration: ${declaration}`);
  }
});

test("maps Phase 2 tokens through canonical Tailwind roles without Neo aliases", () => {
  const css = source("src/app/globals.css");
  const tailwind = source("tailwind.config.ts");

  assert.doesNotMatch(css, /--neo-[a-z0-9-]+\s*:/);
  assert.doesNotMatch(css, /--shadow-popover:/);

  for (const variable of [
    "--hh-l3-hover",
    "--hh-l3-selected",
    "--hh-l3-pressed",
    "--hh-l4-floating-surface",
    "--hh-l5-task-surface",
    "--hh-shadow-operational",
    "--hh-shadow-floating",
    "--hh-shadow-task",
  ]) {
    assert.ok(tailwind.includes(`var(${variable})`), `Tailwind is missing ${variable}`);
  }
});

test("Expense Operations consumes global Phase 2 tokens directly", () => {
  const css = source("src/app/financial/expenses/expenses-ui-theme.css");

  const canonicalTokens = [
    "--hh-l3-hover",
    "--hh-l3-selected",
    "--hh-l3-pressed",
    "--hh-l4-floating-surface",
    "--hh-l5-task-surface",
    "--hh-border",
    "--hh-border-floating",
    "--hh-border-strong",
    "--hh-shadow-operational",
    "--hh-shadow-floating",
    "--hh-shadow-task",
  ];

  for (const token of canonicalTokens) {
    assert.match(css, new RegExp(`var\\(${token}\\)`), `Expense Operations is missing ${token}`);
  }

  assert.doesNotMatch(css, /--eo-(?:depth|border|shadow)/);
});

test("shared primitives consume semantic state and depth roles", () => {
  const table = source("src/components/ui/table.tsx");
  const tabs = source("src/components/ui/tabs.tsx");
  const dropdown = source("src/components/ui/dropdown-menu.tsx");
  const popover = source("src/components/ui/popover.tsx");
  const select = source("src/components/ui/select.tsx");
  const input = source("src/components/ui/input.tsx");
  const textarea = source("src/components/ui/textarea.tsx");
  const dialog = source("src/components/ui/dialog.tsx");
  const sheet = source("src/components/ui/sheet.tsx");
  const typography = source("src/lib/typography.ts");

  assert.match(table, /data-\[state=selected\]:bg-\[var\(--hh-l3-selected\)\]/);
  assert.match(tabs, /data-\[state=active\]:border-\[var\(--hh-accent-primary\)\]/);
  assert.doesNotMatch(tabs, /data-\[state=active\]:bg-\[var\(--hh-l3-selected\)\]/);
  assert.match(dropdown, /bg-\[var\(--hh-l4-floating-surface\)\]/);
  assert.match(dropdown, /shadow-floating/);
  assert.match(popover, /bg-\[var\(--hh-l4-floating-surface\)\]/);
  assert.match(select, /bg-\[var\(--hh-l4-floating-surface\)\]/);
  assert.match(input, /bg-\[var\(--hh-input-background\)\]/);
  assert.match(input, /hover:border-\[var\(--hh-border-emphasis\)\]/);
  assert.match(textarea, /bg-\[var\(--hh-input-background\)\]/);
  assert.match(textarea, /hover:border-\[var\(--hh-border-emphasis\)\]/);
  assert.match(dialog, /bg-\[var\(--hh-l5-task-surface\)\]/);
  assert.match(dialog, /shadow-task/);
  assert.match(sheet, /bg-\[var\(--hh-l5-task-surface\)\]/);
  assert.match(typography, /bg-\[var\(--hh-l2-operational-surface\)\]/);
  assert.match(typography, /shadow-operational/);
});

test("keeps DatePicker on the Certified V2 light floating surface", () => {
  const datePicker = source("src/components/ui/date-picker.tsx");

  assert.match(datePicker, /data-finance-date-picker-appearance="default"/);
  assert.match(datePicker, /bg-\[var\(--hh-l4-floating-surface\)\]/);
  assert.match(datePicker, /shadow-floating/);
  assert.match(
    datePicker,
    /@deprecated Retained for call-site compatibility; runtime is always V2 Light/
  );
  assert.doesNotMatch(datePicker, /appearance === "glass"|themeScope=\{isGlass/);
  assert.doesNotMatch(datePicker, /bg-\[rgba\(18,22,34|backdrop-blur/);
});
