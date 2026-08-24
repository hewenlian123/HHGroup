import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Version 18 actions and fields consume the approved focus, input, invalid, and hover tokens", () => {
  const button = source("src/components/ui/button.tsx");
  const input = source("src/components/ui/input.tsx");
  const select = source("src/components/ui/select.tsx");
  const textarea = source("src/components/ui/textarea.tsx");
  const globals = source("src/app/globals.css");

  assert.match(button, /dark:hover:bg-\[var\(--hh-gold-hover\)\]/);
  assert.match(button, /dark:active:bg-\[var\(--hh-gold-hover\)\]/);
  assert.match(button, /disabled:pointer-events-none disabled:opacity-50/);

  for (const field of [input, select, textarea]) {
    assert.match(field, /hh-focus-ring/);
    assert.match(field, /aria-\[invalid=true\]:border-\[var\(--hh-danger\)\]/);
    assert.match(field, /disabled:[^"\n]*opacity-50/);
  }

  assert.match(globals, /\.neo-input\s*\{[^}]*border-color:\s*var\(--hh-input\);/s);
  assert.match(globals, /\.neo-input\s*\{[^}]*background:\s*var\(--hh-input-background\);/s);
  assert.match(globals, /\.neo-input:focus-visible\s*\{[^}]*border-color:\s*var\(--hh-ring\);/s);
  assert.match(
    globals,
    /\.neo-input\[aria-invalid="true"\]\s*\{[^}]*border-color:\s*var\(--hh-danger\);/s
  );
});

test("Version 18 badges and tables consume semantic states, panel radius, and padding-driven density", () => {
  const badge = source("src/components/ui/badge.tsx");
  const table = source("src/components/ui/table.tsx");

  for (const semantic of ["success", "warning", "information", "danger"]) {
    assert.match(badge, new RegExp(`--hh-${semantic}-soft-fill`));
    assert.match(badge, new RegExp(`--hh-${semantic}-border`));
    assert.match(badge, new RegExp(`--hh-${semantic}\\)`));
  }

  assert.match(table, /rounded-hh-panel/);
  assert.equal((table.match(/px-hh-table-cell-inline/g) ?? []).length, 4);
  assert.equal((table.match(/py-hh-table-cell-block/g) ?? []).length, 4);
  assert.doesNotMatch(table, /h-hh-row-standard/);
  assert.match(table, /hh-touch-table-cell/);
  assert.match(table, /scope=\{scope \?\? "col"\}/);
});

test("Version 18 tabs and floating layers retain Radix state, portal, and surface contracts", () => {
  const tabs = source("src/components/ui/tabs.tsx");
  const dropdown = source("src/components/ui/dropdown-menu.tsx");
  const popover = source("src/components/ui/popover.tsx");
  const select = source("src/components/ui/select.tsx");
  const tooltip = source("src/components/ui/tooltip.tsx");

  assert.match(tabs, /rounded-hh-standard/);
  assert.match(tabs, /data-\[state=active\]:bg-\[var\(--hh-l3-selected\)\]/);
  assert.match(tabs, /hh-focus-ring/);

  for (const layer of [dropdown, popover, select, tooltip]) {
    assert.match(layer, /hh-l4-floating-surface/);
    assert.match(layer, /hh-border-floating/);
    assert.match(layer, /shadow-floating/);
    assert.match(layer, /data-hh-theme/);
  }
  for (const radixLayer of [dropdown, popover, select]) {
    assert.match(radixLayer, /\.Portal/);
  }
  assert.match(select, /position=\{position\}/);
  assert.match(popover, /themeScope = "inherit"/);
  assert.match(tooltip, /event\.key === "Escape"/);
  assert.match(tooltip, /role="tooltip"/);
});

test("Version 18 task layers and loading states preserve controlled behavior, touch, and reduced motion", () => {
  const sheet = source("src/components/ui/sheet.tsx");
  const drawer = source("src/components/base/drawer.tsx");
  const dialog = source("src/components/ui/dialog.tsx");
  const confirm = source("src/components/base/confirm-dialog.tsx");
  const skeleton = source("src/components/ui/skeleton.tsx");

  for (const layer of [sheet, drawer, dialog]) {
    assert.match(layer, /hh-l5-task-surface/);
    assert.match(layer, /shadow-task/);
  }
  for (const radixLayer of [sheet, dialog]) {
    assert.match(radixLayer, /rounded-(?:[a-z]+-)?hh-task/);
    assert.match(radixLayer, /hh-touch-square/);
    assert.match(radixLayer, /data-hh-theme/);
  }

  assert.match(drawer, /open=\{open\} onOpenChange=\{onOpenChange\}/);
  assert.match(confirm, /if \(isBusy && !nextOpen\) return/);
  assert.match(confirm, /onEscapeKeyDown/);
  assert.match(confirm, /onPointerDownOutside/);
  assert.match(confirm, /onOpenChange\(false\)/);

  assert.match(skeleton, /bg-\[var\(--hh-l3-hover\)\]/);
  assert.match(skeleton, /motion-reduce:animate-none/);
  assert.match(skeleton, /aria-hidden/);
  assert.match(skeleton, /role="status"/);
  assert.match(skeleton, /aria-live="polite"/);
});
