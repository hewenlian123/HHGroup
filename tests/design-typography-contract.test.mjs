import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Tailwind exposes every approved semantic typography alias and Geist-first ownership", () => {
  const config = source("tailwind.config.ts");

  assert.match(config, /fontFamily:\s*\{[\s\S]*sans:\s*\["var\(--hh-font-family-sans\)"\]/);
  for (const role of [
    "page-title",
    "section-title",
    "panel-title",
    "body",
    "body-strong",
    "label",
    "metadata",
    "table-header",
    "table-cell",
    "financial",
    "financial-total",
    "control",
    "helper",
    "error",
    "status",
  ]) {
    assert.match(config, new RegExp(`--hh-type-${role}-font-size`));
    assert.match(config, new RegExp(`--hh-type-${role}-line-height`));
    assert.match(config, new RegExp(`--hh-type-${role}-font-weight`));
    assert.match(config, new RegExp(`--hh-type-${role}-letter-spacing`));
  }
});

test("global typography applies the generated sans, FIN, and responsive text-entry contracts", () => {
  const css = source("src/app/globals.css");

  assert.match(css, /body\s*\{[^}]*font-family:\s*var\(--hh-font-family-sans\)/s);
  assert.match(css, /\.hh-fin\s*\{[^}]*font-family:\s*var\(--hh-font-family-sans\)/s);
  assert.match(css, /\.hh-fin\s*\{[^}]*font-variant-numeric:\s*var\(--hh-fin-variant\)/s);
  assert.match(css, /\.hh-fin\s*\{[^}]*font-feature-settings:\s*var\(--hh-fin-features\)/s);
  assert.match(
    css,
    /\.hh-type-text-entry\s*\{[^}]*font-size:\s*var\(--hh-type-text-entry-size-mobile\)/s
  );
  assert.match(
    css,
    /@media\s*\(min-width:\s*768px\)[\s\S]*\.hh-type-text-entry\s*\{[^}]*font-size:\s*var\(--hh-type-text-entry-size-desktop\)/s
  );
});

test("document and print typography remain explicit Inter-first exceptions", () => {
  const css = source("src/app/globals.css");

  for (const selector of [
    ".estimate-a4-page",
    ".invoice-a4-page",
    ".material-selection-a4-page",
    ".receipt",
    ".receipt-print-shell",
    ".payroll-statement-print-root",
  ]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(
    css,
    /font-family:\s*var\(--font-inter\),\s*ui-sans-serif,\s*system-ui,\s*sans-serif;/
  );
});

test("TYPO maps legacy shared call sites to semantic roles without mono numeric workarounds", () => {
  const typography = source("src/lib/typography.ts");

  for (const semanticClass of [
    "text-hh-page-title",
    "text-hh-body",
    "text-hh-label",
    "text-hh-financial",
    "text-hh-table-header",
    "text-hh-body-strong",
    "text-hh-metadata",
    "text-hh-status",
    "text-hh-control",
  ]) {
    assert.match(typography, new RegExp(semanticClass));
  }
  assert.match(typography, /hh-fin/);
  assert.doesNotMatch(typography, /font-mono/);
  assert.doesNotMatch(typography, /text-\[(?:34|36)px\]/);
});

test("approved shared primitives consume semantic typography centrally", () => {
  const expectations = new Map([
    ["src/components/ui/button.tsx", /TYPO\.button/],
    ["src/components/ui/input.tsx", /hh-type-text-entry/],
    ["src/components/ui/textarea.tsx", /hh-type-text-entry/],
    ["src/components/ui/select.tsx", /hh-type-text-entry/],
    ["src/components/ui/searchable-select.tsx", /hh-type-text-entry/],
    ["src/components/ui/creatable-select.tsx", /hh-type-text-entry/],
    ["src/components/ui/card.tsx", /TYPO\.panelTitle/],
    ["src/components/ui/dialog.tsx", /TYPO\.sectionTitle/],
    ["src/components/ui/sheet.tsx", /TYPO\.sectionTitle/],
    ["src/components/base/drawer.tsx", /TYPO\.sectionTitle/],
    ["src/components/ui/table.tsx", /TYPO\.(?:tableHeader|tableCell)/],
  ]);

  for (const [file, pattern] of expectations) {
    assert.match(source(file), pattern, `${file} must consume its semantic typography role`);
  }
});
