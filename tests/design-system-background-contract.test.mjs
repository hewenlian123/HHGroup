import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("defines the approved L0, L1, and L2 background tokens for both themes", () => {
  const css = source("src/styles/design-tokens.generated.css");

  assert.match(css, /--hh-l0-canvas:\s*#F7F7F6;/i);
  assert.match(css, /--hh-l1-workspace:\s*#FFFFFF;/i);
  assert.match(css, /--hh-l2-operational-surface:\s*#FFFFFF;/i);
  assert.match(css, /html\.dark\s*\{[\s\S]*?--hh-l0-canvas:\s*#0A0A0A;/i);
  assert.match(css, /html\.dark\s*\{[\s\S]*?--hh-l1-workspace:\s*#111111;/i);
  assert.match(css, /html\.dark\s*\{[\s\S]*?--hh-l2-operational-surface:\s*#181818;/i);
});

test("maps semantic backgrounds through Tailwind, the shared shell, and Neo compatibility aliases", () => {
  const css = source("src/app/globals.css");
  const tailwind = source("tailwind.config.ts");
  const shell = source("src/components/layout/app-shell.tsx");
  const pageLayout = source("src/components/base/page-layout.tsx");

  assert.match(tailwind, /darkMode:\s*\["selector",\s*"html\.dark"\]/);
  assert.match(tailwind, /canvas:\s*"var\(--hh-l0-canvas\)"/);
  assert.match(tailwind, /workspace:\s*"var\(--hh-l1-workspace\)"/);
  assert.match(tailwind, /surface:\s*"var\(--hh-l2-operational-surface\)"/);
  assert.match(tailwind, /canvas:\s*"var\(--hh-l0-canvas\)"/);
  assert.match(tailwind, /base:\s*"var\(--hh-l1-workspace\)"/);
  assert.match(tailwind, /raised:\s*"var\(--hh-l2-operational-surface\)"/);
  assert.match(tailwind, /muted:\s*"var\(--hh-l2-operational-surface\)"/);
  assert.match(shell, /hh-app-shell[^"\n]*bg-canvas/);
  assert.match(shell, /neo-workspace-canvas[^"\n]*bg-workspace/);
  assert.match(pageLayout, /neo-page-on-graphite[^"\n]*bg-workspace/);
  assert.match(css, /--neo-canvas:\s*var\(--hh-l0-canvas\);/);
  assert.match(css, /--neo-surface-base:\s*var\(--hh-l1-workspace\);/);
  assert.match(css, /--neo-surface-raised:\s*var\(--hh-l2-operational-surface\);/);
});

test("reuses global depth tokens in Expense Operations and removes forced-dark route shells", () => {
  const expenses = source("src/app/financial/expenses/expenses-ui-theme.css");
  const expensesClient = source("src/app/financial/expenses/expenses-client.tsx");
  const dashboard = source("src/app/dashboard/page.tsx");
  const dashboardLoading = source("src/app/dashboard/loading.tsx");
  const workers = source("src/app/labor/workers/page.tsx");
  const bills = source("src/app/bills/bills-ui-styles.ts");
  const health = source("src/app/system-health/page.tsx");
  const estimateOriginInvoice = source(
    "src/app/financial/invoices/new/estimate-origin-invoice-operational.css"
  );
  const estimateList = source("src/app/estimates/estimate-list-operational.css");
  const estimateListClient = source("src/app/estimates/estimates-list-client.tsx");

  assert.match(expenses, /--eo-depth-l0:\s*var\(--hh-l0-canvas\);/);
  assert.match(expenses, /--eo-depth-l1:\s*var\(--hh-l1-workspace\);/);
  assert.match(expenses, /--eo-depth-l2:\s*var\(--hh-l2-operational-surface\);/);
  assert.doesNotMatch(expensesClient, /bg-\[var\(--eo-canvas\)\]/);
  assert.doesNotMatch(dashboard, /className="[^"]*\bdark\b/);
  assert.doesNotMatch(dashboardLoading, /className="[^"]*\bdark\b/);
  assert.doesNotMatch(workers, /className="[^"]*\bdark\b/);
  assert.doesNotMatch(bills, /"dark\s/);
  assert.doesNotMatch(health, /color-scheme:\s*dark/);
  assert.match(estimateOriginInvoice, /background:\s*var\(--hh-l1-workspace\);/);
  assert.match(estimateOriginInvoice, /background:\s*var\(--hh-l2-operational-surface\);/);
  assert.doesNotMatch(estimateOriginInvoice, /--neo-surface-(?:base|raised|muted):\s*#/);
  assert.match(estimateList, /background:\s*var\(--hh-l1-workspace\);/);
  assert.match(estimateList, /background:\s*var\(--hh-l2-operational-surface\);/);
  assert.doesNotMatch(estimateList, /color-scheme:\s*light/);
  assert.match(estimateListClient, /bg-\[var\(--hh-l2-operational-surface\)\]/);
  assert.doesNotMatch(estimateListClient, /bg-\[#f4f4f2\]/);
});

test("keeps the approved estimate preview and print background exception", () => {
  const css = source("src/app/globals.css");

  assert.match(css, /\.estimate-preview-page-shell\s*\{[\s\S]*?background:\s*#181818;/);
  assert.match(css, /\.estimate-preview-shell\s*\{[\s\S]*?background:\s*#181818;/);
  assert.match(css, /@media print\s*\{/);
  assert.match(css, /body:has\(\[data-estimate-pdf-capture="true"\]\)/);
});
