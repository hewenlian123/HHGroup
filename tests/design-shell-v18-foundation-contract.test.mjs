import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Version 18 shell consumes generated sidebar, inset, topbar, and canvas contracts", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  const sidebar = source("src/components/layout/sidebar.tsx");
  const topbar = source("src/components/layout/topbar.tsx");
  const css = source("src/app/globals.css");

  assert.match(shell, /bg-canvas sm:p-hh-sidebar-inset/);
  assert.doesNotMatch(shell, /sm:gap-(?:3|hh-3)/);
  assert.match(shell, /w-hh-sidebar-expanded max-w-\[85vw\]/);
  assert.match(shell, /neo-workspace-canvas[^"\n]*bg-canvas/);
  assert.match(sidebar, /w-hh-sidebar-collapsed/);
  assert.match(sidebar, /w-hh-sidebar-expanded/);
  assert.doesNotMatch(sidebar, /w-\[210px\]|w-\[72px\]/);
  assert.match(sidebar, /aria-label=\{collapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
  assert.match(sidebar, /dark:bg-\[var\(--hh-action-primary\)\]/);
  assert.match(sidebar, /dark:text-\[var\(--hh-action-primary-foreground\)\]/);
  assert.match(topbar, /h-hh-topbar-mobile min-h-hh-topbar-mobile/);
  assert.match(topbar, /sm:h-hh-topbar-desktop sm:min-h-hh-topbar-desktop/);
  assert.match(css, /\.neo-sidebar\s*\{[^}]*background:\s*var\(--hh-l1-workspace\);/s);
  assert.match(css, /\.neo-sidebar\s*\{[^}]*box-shadow:\s*var\(--hh-shadow-sidebar\);/s);
  assert.match(css, /\.neo-workspace-canvas\s*\{[^}]*background:\s*var\(--hh-l0-canvas\);/s);
});

test("Version 18 content widths preserve narrow and document contexts", () => {
  const css = source("src/app/globals.css");
  const pageLayout = source("src/components/base/page-layout.tsx");

  assert.match(css, /max-width:\s*min\(var\(--hh-content-width-max\), calc\(100vw - 2rem\)\)/);
  assert.match(css, /max-width:\s*min\(var\(--hh-content-width-narrow\), calc\(100vw - 2rem\)\)/);
  assert.match(css, /max-width:\s*min\(var\(--hh-content-width-document\), calc\(100vw - 2rem\)\)/);
  assert.doesNotMatch(css, /max-width:\s*min\((?:1536|1680|1760)px/);
  assert.match(pageLayout, /neo-page-on-graphite page-container[^"\n]*bg-canvas/);
});

test("Version 18 global search, create action, and mobile nav use semantic Neo roles", () => {
  const css = source("src/app/globals.css");
  const topbar = source("src/components/layout/topbar.tsx");
  const bottomNav = source("src/components/layout/bottom-nav.tsx");

  assert.match(css, /\.neo-topbar-command-input\s*\{[^}]*border-color:\s*var\(--hh-input\);/s);
  assert.match(
    css,
    /\.neo-topbar-command-input\s*\{[^}]*background:\s*var\(--hh-input-background\);/s
  );
  assert.match(topbar, /\/\* \+ New[^]*?<DropdownMenuTrigger asChild>\s*<Button\s+size="sm"/);
  assert.match(topbar, /!text-\[var\(--hh-action-primary-foreground\)\]/);
  assert.match(bottomNav, /bg-\[var\(--hh-gold-muted\)\][^"\n]*text-\[var\(--hh-gold\)\]/);
  assert.match(bottomNav, /min-h-\[44px\]/);
});
