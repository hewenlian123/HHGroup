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
    "--hh-shadow-operational: 0 1px 2px rgb(0 0 0 / 0.04), 0 14px 32px -26px rgb(0 0 0 / 0.24);",
    "--hh-shadow-floating: 0 2px 8px -3px rgb(0 0 0 / 0.10), 0 22px 48px -18px rgb(0 0 0 / 0.22);",
    "--hh-shadow-task: 0 4px 12px -5px rgb(0 0 0 / 0.12), 0 34px 72px -26px rgb(0 0 0 / 0.28);",
  ]) {
    assert.ok(css.includes(declaration), `missing light declaration: ${declaration}`);
  }

  for (const declaration of [
    "--hh-l3-hover: #222222;",
    "--hh-l3-selected: #2c2c2c;",
    "--hh-l3-pressed: #323232;",
    "--hh-l4-floating-surface: #252525;",
    "--hh-l5-task-surface: #292929;",
    "--hh-shadow-operational: 0 1px 0 rgb(255 255 255 / 0.025), 0 14px 34px -26px rgb(0 0 0 / 0.84);",
    "--hh-shadow-floating: 0 1px 0 rgb(255 255 255 / 0.055), 0 20px 46px -14px rgb(0 0 0 / 0.76);",
    "--hh-shadow-task: 0 1px 0 rgb(255 255 255 / 0.065), 0 32px 76px -20px rgb(0 0 0 / 0.92);",
  ]) {
    assert.ok(css.includes(declaration), `missing dark declaration: ${declaration}`);
  }
});

test("generates the approved Phase 5 focus and semantic soft-state tokens", () => {
  const css = source("src/styles/design-tokens.generated.css");

  for (const declaration of [
    "--hh-focus-ring: rgb(23 23 23 / 32%);",
    "--hh-success-soft-fill: rgb(22 129 91 / 8%);",
    "--hh-success-border: rgb(22 129 91 / 22%);",
    "--hh-warning-soft-fill: rgb(161 98 7 / 8%);",
    "--hh-warning-border: rgb(161 98 7 / 22%);",
    "--hh-information-soft-fill: rgb(37 99 168 / 8%);",
    "--hh-information-border: rgb(37 99 168 / 22%);",
    "--hh-danger-soft-fill: rgb(180 35 47 / 8%);",
    "--hh-danger-border: rgb(180 35 47 / 22%);",
  ]) {
    assert.ok(css.includes(declaration), `missing light declaration: ${declaration}`);
  }

  for (const declaration of [
    "--hh-focus-ring: rgb(242 242 239 / 38%);",
    "--hh-success-soft-fill: rgb(76 175 124 / 8%);",
    "--hh-success-border: rgb(76 175 124 / 22%);",
    "--hh-warning-soft-fill: rgb(216 163 74 / 8%);",
    "--hh-warning-border: rgb(216 163 74 / 22%);",
    "--hh-information-soft-fill: rgb(110 159 209 / 8%);",
    "--hh-information-border: rgb(110 159 209 / 22%);",
    "--hh-danger-soft-fill: rgb(227 107 114 / 8%);",
    "--hh-danger-border: rgb(227 107 114 / 22%);",
  ]) {
    assert.ok(css.includes(declaration), `missing dark declaration: ${declaration}`);
  }
});

test("maps Phase 2 tokens through global compatibility aliases and Tailwind", () => {
  const css = source("src/app/globals.css");
  const tailwind = source("tailwind.config.ts");

  assert.match(css, /--neo-surface-hover:\s*var\(--hh-l3-hover\);/);
  assert.match(css, /--neo-shadow-panel:\s*var\(--hh-shadow-operational\);/);
  assert.match(css, /--neo-shadow-panel-hover:\s*var\(--hh-shadow-operational\);/);
  assert.match(css, /--neo-shadow-command:\s*var\(--hh-shadow-floating\);/);
  assert.match(css, /--shadow-popover:\s*var\(--hh-shadow-floating\);/);

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

test("maps Expense Operations aliases to global Phase 2 tokens", () => {
  const css = source("src/app/financial/expenses/expenses-ui-theme.css");

  const aliases = [
    ["--eo-depth-l3-hover", "--hh-l3-hover"],
    ["--eo-depth-l3-selected", "--hh-l3-selected"],
    ["--eo-depth-l3-pressed", "--hh-l3-pressed"],
    ["--eo-depth-l4", "--hh-l4-floating-surface"],
    ["--eo-depth-l5", "--hh-l5-task-surface"],
    ["--eo-border", "--hh-border"],
    ["--eo-border-floating", "--hh-border-floating"],
    ["--eo-border-strong", "--hh-border-strong"],
    ["--eo-shadow-operational", "--hh-shadow-operational"],
    ["--eo-shadow-floating", "--hh-shadow-floating"],
    ["--eo-shadow-task", "--hh-shadow-task"],
  ];

  for (const [alias, canonical] of aliases) {
    assert.match(css, new RegExp(`${alias}:\\s*var\\(${canonical}\\);`));
  }
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
  assert.match(tabs, /data-\[state=active\]:bg-\[var\(--hh-l3-selected\)\]/);
  assert.match(dropdown, /bg-\[var\(--hh-l4-floating-surface\)\]/);
  assert.match(dropdown, /shadow-floating/);
  assert.match(popover, /bg-\[var\(--hh-l4-floating-surface\)\]/);
  assert.match(select, /bg-\[var\(--hh-l4-floating-surface\)\]/);
  assert.match(input, /hover:bg-\[var\(--hh-l3-hover\)\]/);
  assert.match(textarea, /hover:bg-\[var\(--hh-l3-hover\)\]/);
  assert.match(dialog, /bg-\[var\(--hh-l5-task-surface\)\]/);
  assert.match(dialog, /shadow-task/);
  assert.match(sheet, /bg-\[var\(--hh-l5-task-surface\)\]/);
  assert.match(typography, /bg-\[var\(--hh-l2-operational-surface\)\]/);
  assert.match(typography, /shadow-operational/);
});

test("preserves the documented glass date picker exception", () => {
  const datePicker = source("src/components/ui/date-picker.tsx");

  assert.match(datePicker, /appearance\?:\s*"default"\s*\|\s*"glass"/);
  assert.match(datePicker, /bg-\[rgba\(18,22,34,0\.96\)\]/);
  assert.match(datePicker, /backdrop-blur-\[28px\]/);
});
