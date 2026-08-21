import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("floating surfaces are portaled, semantic L4 surfaces without forced-dark ownership", () => {
  const dropdown = source("src/components/ui/dropdown-menu.tsx");
  const popover = source("src/components/ui/popover.tsx");
  const select = source("src/components/ui/select.tsx");

  for (const file of [dropdown, popover, select]) {
    assert.match(file, /hh-l4-floating-surface/);
    assert.match(file, /hh-border-floating/);
    assert.match(file, /shadow-floating/);
    assert.match(file, /\.Portal/);
  }
  assert.match(popover, /themeScope = "inherit"/);
  assert.doesNotMatch(popover, /themeScope = "dark"/);
  assert.doesNotMatch(dropdown, /hover:-translate|active:scale|zoom-in|zoom-out/);
});

test("Tooltip owns a portaled accessible description and Escape dismissal", () => {
  const tooltip = source("src/components/ui/tooltip.tsx");

  assert.match(tooltip, /createPortal/);
  assert.match(tooltip, /role="tooltip"/);
  assert.match(tooltip, /aria-describedby/);
  assert.match(tooltip, /event\.key === "Escape"/);
  assert.match(tooltip, /hh-l4-floating-surface/);
});

test("one Combobox core owns arrows, active descendant, Escape, and unclipped portal rendering", () => {
  const combobox = source("src/components/ui/combobox.tsx");
  const searchable = source("src/components/ui/searchable-select.tsx");
  const creatable = source("src/components/ui/creatable-select.tsx");

  assert.match(combobox, /createPortal/);
  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /aria-activedescendant/);
  assert.match(combobox, /ArrowDown/);
  assert.match(combobox, /ArrowUp/);
  assert.match(combobox, /event\.key === "Enter"/);
  assert.match(combobox, /event\.key === "Escape"/);
  assert.match(combobox, /role="listbox"/);
  assert.match(combobox, /hh-l4-floating-surface/);
  assert.match(searchable, /<Combobox/);
  assert.match(creatable, /<Combobox/);
  assert.doesNotMatch(searchable, /role="listbox"/);
  assert.doesNotMatch(creatable, /role="listbox"/);
});

test("Dialog and Sheet own restrained L5 task surfaces, safe areas, and neutral close focus", () => {
  const dialog = source("src/components/ui/dialog.tsx");
  const sheet = source("src/components/ui/sheet.tsx");
  const taskFooter = source("src/components/ui/task-footer.tsx");

  for (const file of [dialog, sheet]) {
    assert.match(file, /hh-l5-task-surface/);
    assert.match(file, /shadow-task/);
    assert.match(file, /hh-focus-ring/);
    assert.doesNotMatch(file, /hover:-translate|active:scale|neo-gold-ring/);
  }
  assert.match(sheet, /env\(safe-area-inset-bottom\)/);
  assert.match(taskFooter, /env\(safe-area-inset-bottom\)/);
  assert.match(taskFooter, /variant === "dialog"/);
  assert.match(taskFooter, /variant === "sheet"/);
  assert.match(taskFooter, /variant === "sticky"/);
});

test("ConfirmDialog enforces the approved pending, dismissal, success, and failure contract", () => {
  const confirm = source("src/components/base/confirm-dialog.tsx");

  assert.match(confirm, /if \(isBusy && !nextOpen\) return/);
  assert.match(confirm, /onEscapeKeyDown/);
  assert.match(confirm, /event\.preventDefault\(\)/);
  assert.match(confirm, /onPointerDownOutside/);
  assert.match(confirm, /role="alert"/);
  assert.match(confirm, /setError/);
  assert.match(confirm, /onOpenChange\(false\)/);
  assert.match(confirm, /onCloseAutoFocus/);
  assert.match(confirm, /restoreFocusRef/);
  assert.match(confirm, /variant=\{destructive \? "destructive" : "primary"\}/);
  assert.doesNotMatch(confirm, /console\.error|dismissBeforeAsync\) \{/);
});

test("RowActions delegates keyboard behavior to DropdownMenuItem and keeps touch targets", () => {
  const rowActions = source("src/components/base/row-actions-menu.tsx");
  const interaction = source("src/lib/list-table-interaction.ts");

  assert.match(rowActions, /DropdownMenuItem/);
  assert.match(rowActions, /onSelect/);
  assert.doesNotMatch(rowActions, /<button[\s\S]*role="menuitem"/);
  assert.match(interaction, /hh-touch-row/);
  assert.doesNotMatch(interaction, /hover:-translate|active:scale/);
});

test("DatePicker preserves Hawaii YMD and scoped glass while using inherited generic Popover", () => {
  const datePicker = source("src/components/ui/date-picker.tsx");
  const neoForm = source("src/components/base/neo-form.tsx");

  assert.match(datePicker, /hawaiiTodayYmd/);
  assert.match(datePicker, /function toYmd/);
  assert.match(datePicker, /appearance === "glass"/);
  assert.match(datePicker, /themeScope=\{isGlass \? "dark" : "inherit"\}/);
  assert.match(neoForm, /@deprecated Use `FinanceDatePicker`/);
  assert.match(neoForm, /@deprecated Use `Drawer`/);
  assert.match(neoForm, /<TaskFooter/);
});
