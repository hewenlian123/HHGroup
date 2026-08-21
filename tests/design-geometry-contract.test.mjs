import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Tailwind exposes all approved semantic geometry aliases", () => {
  const config = source("tailwind.config.ts");

  for (const variable of [
    "--hh-space-1",
    "--hh-space-2",
    "--hh-space-3",
    "--hh-space-4",
    "--hh-space-5",
    "--hh-space-6",
    "--hh-space-8",
    "--hh-space-10",
    "--hh-radius-compact",
    "--hh-radius-standard",
    "--hh-radius-task",
    "--hh-touch-min",
    "--hh-control-height-compact",
    "--hh-control-height-standard",
    "--hh-control-height-comfortable",
    "--hh-control-height-touch",
    "--hh-row-height-dense",
    "--hh-row-height-standard",
    "--hh-row-min-height-touch",
    "--hh-panel-padding-compact",
    "--hh-panel-padding-standard",
    "--hh-task-padding-mobile",
    "--hh-task-padding-desktop",
    "--hh-page-gutter-mobile",
    "--hh-page-gutter-tablet",
    "--hh-page-gutter-desktop",
    "--hh-page-gutter-wide",
    "--hh-gap-related",
    "--hh-gap-section",
    "--hh-gap-region",
  ]) {
    assert.match(config, new RegExp(`var\\(${variable}\\)`), `${variable} needs a Tailwind alias`);
  }
});

test("legacy spacing aliases and shared page geometry consume generated dimensions", () => {
  const css = source("src/app/globals.css");

  for (const suffix of ["1", "2", "3", "4", "5", "6", "8", "10"]) {
    assert.match(css, new RegExp(`--space-${suffix}:\\s*var\\(--hh-space-${suffix}\\);`));
  }
  assert.match(css, /padding-inline:\s*var\(--hh-page-gutter-mobile\)/);
  assert.match(css, /padding-inline:\s*var\(--hh-page-gutter-tablet\)/);
  assert.match(css, /padding-inline:\s*var\(--hh-page-gutter-desktop\)/);
  assert.match(css, /padding-inline:\s*var\(--hh-page-gutter-wide\)/);
});

test("shared primitives consume semantic geometry without legacy four, ten, or twenty-four pixel radii", () => {
  const files = [
    "src/components/ui/button.tsx",
    "src/components/ui/input.tsx",
    "src/components/ui/textarea.tsx",
    "src/components/ui/select.tsx",
    "src/components/ui/searchable-select.tsx",
    "src/components/ui/creatable-select.tsx",
    "src/components/ui/tabs.tsx",
    "src/components/ui/table.tsx",
    "src/components/ui/card.tsx",
    "src/components/ui/dialog.tsx",
    "src/components/ui/sheet.tsx",
    "src/components/base/drawer.tsx",
    "src/components/ui/popover.tsx",
    "src/components/ui/date-picker.tsx",
    "src/lib/list-table-interaction.ts",
    "src/lib/typography.ts",
  ];
  const combined = files.map(source).join("\n");

  assert.doesNotMatch(combined, /\brounded-sm\b/);
  assert.doesNotMatch(combined, /rounded-\[(?:10px|1\.5rem)\]/);
  assert.match(source("src/components/ui/card.tsx"), /p-hh-panel-standard/);
  assert.match(source("src/components/ui/dialog.tsx"), /rounded-hh-task/);
  assert.match(source("src/components/ui/sheet.tsx"), /rounded-[tblr]+-hh-task/);
  assert.match(source("src/components/ui/popover.tsx"), /rounded-hh-standard/);
  assert.match(source("src/components/ui/date-picker.tsx"), /rounded-hh-standard/);
});

test("shared controls and interactive rows use the compiled semantic touch utilities", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /@media\s*\(max-width:\s*1023px\),\s*\(pointer:\s*coarse\)/);
  assert.match(css, /\.hh-touch-min\s*\{[^}]*min-height:\s*var\(--hh-touch-min\)/s);
  assert.match(css, /\.hh-touch-square\s*\{[^}]*min-width:\s*var\(--hh-touch-min\)/s);
  assert.match(css, /\.hh-touch-table-cell\s*\{[^}]*height:\s*var\(--hh-row-min-height-touch\)/s);

  const expectations = new Map([
    ["src/components/ui/button.tsx", /hh-touch-min/],
    ["src/components/ui/input.tsx", /hh-touch-min/],
    ["src/components/ui/select.tsx", /hh-touch-min/],
    ["src/components/ui/searchable-select.tsx", /hh-touch-min/],
    ["src/components/ui/creatable-select.tsx", /hh-touch-min/],
    ["src/components/ui/tabs.tsx", /hh-touch-min/],
    ["src/components/ui/date-picker.tsx", /hh-touch-min/],
    ["src/lib/list-table-interaction.ts", /hh-touch-square/],
  ]);

  for (const [file, pattern] of expectations) {
    assert.match(source(file), pattern, `${file} must apply the shared touch minimum`);
  }
  assert.match(source("src/components/ui/table.tsx"), /hh-touch-table-cell/);
  assert.match(source("src/components/ui/dialog.tsx"), /hh-touch-square/);
  assert.match(source("src/components/ui/sheet.tsx"), /hh-touch-square/);
});
