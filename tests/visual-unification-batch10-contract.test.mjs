import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("app shell chrome uses navy and brass tokens", () => {
  const shell = source("src/components/layout/app-shell-visual.css");
  assert.match(shell, /--shell-text:\s*var\(--hh-ink\)/);
  assert.match(shell, /--shell-accent:\s*var\(--hh-brass\)/);
  assert.match(shell, /--hh-focus-ring:\s*var\(--hh-link\)/);
  assert.match(shell, /--hh-action-primary:\s*var\(--hh-brass\)/);
  assert.match(shell, /background:\s*var\(--hh-grad-brass\)/);
  assert.doesNotMatch(shell, /#8a6925|#e6ce96|#74571d|#faf5e9/);
  assert.doesNotMatch(source("src/components/layout/app-shell.tsx"), /bg-\[#f5f5f5\]/);
});

test("estimate print and preview shells leave the paper white", () => {
  const css = source("src/app/globals.css");
  assert.match(
    css,
    /\.estimate-print-workspace:not\(\.estimate-print-pdf-capture\)\s*\{[^}]*var\(--hh-l0-canvas\)/s
  );
  assert.match(css, /\.estimate-print-action-bar\s*\{[^}]*var\(--hh-surface\)/s);
  assert.match(css, /background-image:\s*var\(--hh-grad-brass\)/);
  assert.match(css, /\.estimate-a4-page\s*\{[^}]*background:\s*#ffffff/s);
  assert.doesNotMatch(css, /#181818/);
  assert.doesNotMatch(source("src/app/estimates/[id]/print/page.tsx"), /text-zinc-900/);
  assert.match(source("src/app/estimates/[id]/print/page.tsx"), /data-hh-context="document-route"/);

  const payment = source("src/app/estimates/[id]/payments/[paymentId]/preview/page.tsx");
  assert.match(payment, /data-hh-context="document-route"/);
  assert.match(payment, /rounded-card/);
  assert.doesNotMatch(payment, /zinc-/);
  assert.doesNotMatch(payment, /tracking-wider/);
  assert.doesNotMatch(
    source("src/app/estimates/[id]/payments/[paymentId]/preview/payment-preview-actions.tsx"),
    /zinc-/
  );
});
