import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("authenticated operational UI is locked to the approved light pre-paint contract", () => {
  const theme = source("src/lib/operational-theme.ts");
  const layout = source("src/app/layout.tsx");
  const shell = source("src/components/layout/app-shell.tsx");

  assert.match(theme, /HH_OPERATIONAL_THEME_STORAGE_KEY = "hh-theme"/);
  assert.match(theme, /"operational-dark" \| "operational-light"/);
  assert.match(theme, /DEFAULT_OPERATIONAL_THEME_MODE: OperationalThemeMode = "light"/);
  assert.match(theme, /root\.dataset\.hhTheme = "operational-light"/);
  assert.match(theme, /root\.classList\.remove\("dark"\)/);
  assert.match(theme, /root\.classList\.add\("light"\)/);
  assert.match(theme, /localStorage\.setItem\(HH_OPERATIONAL_THEME_STORAGE_KEY, "light"\)/);
  assert.match(
    layout,
    /<script\s+id="hh-operational-theme"\s+dangerouslySetInnerHTML=\{\{ __html: OPERATIONAL_THEME_BOOTSTRAP_SCRIPT \}\}/
  );
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(shell, /: "operational-light"/);
  assert.doesNotMatch(shell, /operationalThemeMode|applyOperationalThemeMode/);
});

test("TopBar removes the retired dark-theme toggle while preserving adjacent actions", () => {
  const topbar = source("src/components/layout/topbar.tsx");
  const createIndex = topbar.indexOf("{/* + New");
  const bellIndex = topbar.indexOf('aria-label="Notifications"');

  assert.ok(createIndex >= 0 && createIndex < bellIndex, "Create must precede Notifications");
  assert.doesNotMatch(topbar, /data-operational-theme-toggle/);
  assert.doesNotMatch(topbar, /Switch to (?:light|dark) mode|<Sun|<Moon/);
});

test("operational themes preserve document paper while viewer chrome stays operational-light", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  const generated = source("src/styles/design-tokens.generated.css");
  const globals = source("src/app/globals.css");

  assert.match(shell, /documentRoute\s*\?\s*"document-light"/);
  assert.match(shell, /viewerRoute\s*\?\s*"operational-light"/);
  assert.doesNotMatch(shell, /showOperationalThemeToggle|onToggleOperationalTheme/);
  assert.match(generated, /\[data-hh-theme="operational-light"\]/);
  assert.match(generated, /\[data-hh-theme="operational-dark"\]/);
  assert.match(generated, /\[data-hh-theme="document-light"\]/);
  assert.doesNotMatch(
    globals,
    /html\.dark\s+\.(?:neo-command-bar|hh-motion-root|text-hh-profit-positive)/,
    "raw root dark selectors must not cross protected nested theme boundaries"
  );
});
