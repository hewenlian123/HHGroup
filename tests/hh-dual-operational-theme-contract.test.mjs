import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("authenticated operational theme persists with the approved pre-paint contract", () => {
  const theme = source("src/lib/operational-theme.ts");
  const layout = source("src/app/layout.tsx");
  const shell = source("src/components/layout/app-shell.tsx");

  assert.match(theme, /HH_OPERATIONAL_THEME_STORAGE_KEY = "hh-theme"/);
  assert.match(theme, /"operational-dark" \| "operational-light"/);
  assert.match(theme, /storedTheme === "light"/);
  assert.match(theme, /localStorage\.setItem\(HH_OPERATIONAL_THEME_STORAGE_KEY, mode\)/);
  assert.match(theme, /root\.dataset\.hhTheme = theme/);
  assert.match(theme, /root\.classList\.toggle\("dark", mode === "dark"\)/);
  assert.match(theme, /root\.classList\.toggle\("light", mode === "light"\)/);
  assert.match(
    layout,
    /<script\s+id="hh-operational-theme"\s+dangerouslySetInnerHTML=\{\{ __html: OPERATIONAL_THEME_BOOTSTRAP_SCRIPT \}\}/
  );
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(shell, /React\.useState<OperationalThemeMode>\(readOperationalThemeMode\)/);
  assert.match(shell, /applyOperationalThemeMode\(operationalThemeMode\)/);
});

test("TopBar exposes the v19 accessible toggle hierarchy", () => {
  const topbar = source("src/components/layout/topbar.tsx");
  const createIndex = topbar.indexOf("{/* + New");
  const toggleIndex = topbar.indexOf("data-operational-theme-toggle");
  const bellIndex = topbar.indexOf('aria-label="Notifications"');

  assert.ok(createIndex >= 0 && createIndex < toggleIndex, "theme toggle must follow Create");
  assert.ok(toggleIndex < bellIndex, "theme toggle must precede Notifications");
  assert.match(topbar, /"Switch to light mode"/);
  assert.match(topbar, /"Switch to dark mode"/);
  assert.match(topbar, /<Sun[^>]*aria-hidden/);
  assert.match(topbar, /<Moon[^>]*aria-hidden/);
});

test("operational themes remain separate from protected document and viewer scopes", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  const generated = source("src/styles/design-tokens.generated.css");
  const globals = source("src/app/globals.css");

  assert.match(shell, /documentRoute\s*\?\s*"document-light"/);
  assert.match(shell, /viewerRoute\s*\?\s*"neo-dark"/);
  assert.match(shell, /showOperationalThemeToggle=\{routeContext === "operational"\}/);
  assert.match(generated, /\[data-hh-theme="operational-light"\]/);
  assert.match(generated, /\[data-hh-theme="operational-dark"\]/);
  assert.match(generated, /\[data-hh-theme="document-light"\]/);
  assert.doesNotMatch(
    globals,
    /html\.dark\s+\.(?:neo-command-bar|hh-motion-root|text-hh-profit-positive)/,
    "raw root dark selectors must not cross protected nested theme boundaries"
  );
});
