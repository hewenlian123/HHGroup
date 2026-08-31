import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Foundation emits the dense menu min-height and shared Light scrim token", () => {
  const config = source("tailwind.config.ts");
  const tokens = source("src/styles/hh-design-system-v2.css");
  const motion = source("src/lib/motion-system.ts");

  assert.match(config, /minHeight:\s*\{[^}]*"hh-row-dense":\s*"var\(--hh-row-height-dense\)"/s);
  assert.match(tokens, /--hh-overlay-scrim:\s*rgb\(24 26 30 \/ 32%\);/);
  assert.match(
    tokens,
    /\.hh-overlay-scrim\s*\{[^}]*background-color:\s*var\(--hh-overlay-scrim\);[^}]*backdrop-filter:\s*none;[^}]*-webkit-backdrop-filter:\s*none;/s
  );
  assert.match(motion, /"hh-overlay-scrim"/);
  assert.doesNotMatch(motion, /bg-\[var\(--hh-overlay-scrim\)\]/);
  assert.doesNotMatch(motion, /bg-\[color-mix\(/);
});

test("shared Tabs default is underline-only instead of a boxed segmented control", () => {
  const tabs = source("src/components/ui/tabs.tsx");

  assert.match(tabs, /border-b-2 border-transparent/);
  assert.match(tabs, /data-\[state=active\]:border-\[var\(--hh-accent-primary\)\]/);
  assert.doesNotMatch(tabs, /data-\[state=active\]:bg-\[var\(--hh-l3-selected\)\]/);
  assert.doesNotMatch(tabs, /rounded-hh-standard border border-\[var\(--hh-border\)\]/);
});

test("Estimate actions inherit shared Dropdown geometry without legacy overrides", () => {
  const dropdown = source("src/components/ui/dropdown-menu.tsx");
  const estimateHeader = source("src/app/estimates/[id]/estimate-detail-header.tsx");

  assert.match(dropdown, /min-h-hh-row-dense/);
  assert.match(dropdown, /rounded-hh-standard/);
  assert.match(dropdown, /rounded-hh-compact/);
  assert.doesNotMatch(
    estimateHeader,
    /rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md/
  );
  assert.doesNotMatch(estimateHeader, /rounded-sm focus:bg-muted focus:text-foreground/);
});

test("DatePicker has one V2 Light runtime and Estimate does not request glass", () => {
  const picker = source("src/components/ui/date-picker.tsx");
  const estimateDetails = source(
    "src/app/estimates/_components/estimate-edit-customer-section.tsx"
  );

  assert.match(picker, /data-finance-date-picker-appearance="default"/);
  assert.match(
    picker,
    /bg-\[var\(--hh-l4-floating-surface\)\].*text-\[var\(--hh-text-primary\)\].*shadow-floating/s
  );
  assert.doesNotMatch(picker, /backdrop-blur|backdrop-saturate|themeScope=\{isGlass/);
  assert.doesNotMatch(picker, /bg-\[rgba\(18,22,34/);
  assert.doesNotMatch(estimateDetails, /appearance="glass"/);
});

test("shared and Estimate Sheet titles consume the V2 section-title contract", () => {
  const estimateCss = source("src/app/estimates/_components/estimate-builder-operational.css");
  const floatingAction = source("src/components/layout/floating-action-button.tsx");

  assert.match(
    estimateCss,
    /\.estimate-builder\.eb-sheet-glass\.eb-estimate-details-sheet \.eb-sheet-title\s*\{[^}]*font-weight:\s*var\(--hh-type-section-title-font-weight\);[^}]*line-height:\s*var\(--hh-type-section-title-line-height\);/s
  );
  assert.doesNotMatch(floatingAction, /<SheetTitle className="text-base font-medium">/);
});
