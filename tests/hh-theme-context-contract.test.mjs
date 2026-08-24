import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

function source(path) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function sourceFiles(directory) {
  const root = resolve(ROOT, directory);
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path)) {
      const absolute = join(path, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx)$/.test(entry)) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

function mediaBlocks(css) {
  const blocks = [];
  let cursor = 0;
  while ((cursor = css.indexOf("@media", cursor)) !== -1) {
    const open = css.indexOf("{", cursor);
    if (open === -1) break;
    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth > 0) {
      if (css[end] === "{") depth += 1;
      if (css[end] === "}") depth -= 1;
      end += 1;
    }
    blocks.push(css.slice(cursor, end));
    cursor = end;
  }
  return blocks;
}

test("route roots expose explicit contexts and a neutral sibling portal host", () => {
  const context = source("src/contexts/hh-theme-context.tsx");
  const shell = source("src/components/layout/app-shell.tsx");

  for (const value of [
    "operational",
    "auth",
    "public-worker-intake",
    "document-route",
    "viewer",
    "paper",
    "evidence",
  ]) {
    assert.match(context, new RegExp(`"${value}"`));
  }
  for (const value of ["neo-dark", "auth", "public", "document-light"]) {
    assert.match(context, new RegExp(`"${value}"`));
  }
  assert.match(context, /data-hh-portal-host="true"/);
  assert.match(context, /<\/div>\s*<div ref=\{setPortalContainer\}/);
  assert.match(shell, /pathname === "\/login"/);
  assert.match(shell, /pathname === "\/upload-receipt"/);
  assert.match(shell, /startsWith\("\/receipt\/print\/"\)/);
  for (const routePattern of [
    "/^\\/estimates\\/",
    "/^\\/financial\\/invoices\\/",
    "/^\\/materials\\/",
    "/^\\/workers\\/",
    "/^\\/labor\\/payments\\/",
  ]) {
    assert.ok(shell.includes(routePattern), `missing explicit route pattern ${routePattern}`);
  }
  assert.match(shell, /<HhRouteThemeRoot context=\{routeContext\} theme=\{routeTheme\}>/);
});

test("all React and Radix portals use the themed portal contract", () => {
  const files = sourceFiles("src");
  for (const absolute of files) {
    const contents = readFileSync(absolute, "utf8");
    const label = relative(ROOT, absolute);
    for (const match of contents.matchAll(/<[A-Za-z]+Primitive\.Portal\b[^>]*>/g)) {
      assert.match(match[0], /container=/, `${label} has an unscoped Radix portal`);
    }
    if (contents.includes("createPortal(")) {
      assert.match(contents, /useHhPortalContainer/, `${label} bypasses the portal provider`);
      assert.match(
        contents,
        /portalContainer \?\? document\.body/,
        `${label} does not use the themed portal host`
      );
    }
  }
});

test("generated and compatibility tokens expose every explicit all-viewport theme", async () => {
  const generated = source("src/styles/design-tokens.generated.css");
  const globals = source("src/app/globals.css");
  const tailwind = source("tailwind.config.ts");

  for (const theme of ["auth", "public", "document-light", "neo-dark"]) {
    assert.match(generated, new RegExp(`data-hh-theme="${theme}"`));
    assert.match(globals, new RegExp(`data-hh-theme="${theme}"`));
  }
  assert.match(tailwind, /darkMode:\s*\[\s*"variant"/);
  assert.match(tailwind, /explicitLightThemeBoundary/);
  for (const theme of ["auth", "public", "document-light"]) {
    assert.match(tailwind, new RegExp(`data-hh-theme=\\"${theme}\\"`));
  }

  const postcss = require("postcss");
  const tailwindPlugin = require("tailwindcss");
  const loadConfig = require("tailwindcss/loadConfig");
  const compiled = await postcss([
    tailwindPlugin({
      ...loadConfig(resolve(ROOT, "tailwind.config.ts")),
      content: [{ raw: '<div class="dark:bg-black"></div>' }],
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  assert.match(compiled.css, /data-hh-theme=.?neo-dark/);
  for (const theme of ["auth", "public", "document-light"]) {
    assert.match(
      compiled.css,
      new RegExp(`:not\\([^}]*data-hh-theme=.?${theme}`),
      `compiled dark utility must exclude ${theme}`
    );
  }
  for (const css of [
    generated,
    globals,
    source("src/app/financial/expenses/expenses-ui-theme.css"),
  ]) {
    for (const block of mediaBlocks(css)) {
      assert.doesNotMatch(block, /data-hh-theme/, "theme activation must not be viewport-gated");
    }
  }
});

test("protected document, paper, viewer, and evidence roots are explicit", () => {
  const contracts = [
    ["src/app/estimates/[id]/preview/page.tsx", 'data-hh-context="viewer"'],
    ["src/app/estimates/[id]/preview/estimate-preview-content.tsx", 'data-hh-context="paper"'],
    ["src/app/estimates/[id]/print/page.tsx", 'data-hh-context="document-route"'],
    [
      "src/app/financial/invoices/[id]/preview/invoice-preview-shell.tsx",
      'data-hh-context="paper"',
    ],
    ["src/app/financial/invoices/[id]/print/page.tsx", 'data-hh-context="document-route"'],
    [
      "src/app/materials/[id]/preview/material-selection-preview-shell.tsx",
      'data-hh-context="paper"',
    ],
    ["src/app/materials/[id]/print/page.tsx", 'data-hh-context="document-route"'],
    ["src/components/financial/payment-receipt-body.tsx", 'data-hh-context="paper"'],
    ["src/components/labor/worker-payment-receipt-body.tsx", 'data-hh-context="paper"'],
    ["src/app/receipt/print/[id]/page.tsx", 'data-hh-context="document-route"'],
    ["src/app/workers/[id]/statement/print/page.tsx", 'data-hh-context="document-route"'],
    ["src/components/attachment-preview-modal.tsx", 'data-hh-context="evidence"'],
    ["src/components/receipt-viewer/receipt-viewer-dialog.tsx", 'data-hh-context="evidence"'],
    ["src/app/financial/expenses/expense-receipt-preview-dialog.tsx", 'data-hh-context="evidence"'],
    ["src/app/financial/expenses/expense-inbox-preview-modal.tsx", 'data-hh-context="evidence"'],
    ["src/app/labor/receipts/receipts-client.tsx", 'data-hh-context="evidence"'],
  ];

  for (const [path, marker] of contracts) {
    assert.ok(source(path).includes(marker), `${path} is missing ${marker}`);
  }
  assert.doesNotMatch(
    source("src/components/receipt-viewer/receipt-viewer-dialog.tsx"),
    /"dark relative/
  );
  assert.doesNotMatch(source("src/app/workers/[id]/statement/page.tsx"), /className="dark /);
});
