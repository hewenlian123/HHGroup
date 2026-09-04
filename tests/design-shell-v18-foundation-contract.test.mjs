import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Figma v2 shell consumes the white workspace, compact navigation, and header contracts", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  const shellChrome = source("src/components/layout/app-shell-chrome.tsx");
  const sidebar = source("src/components/layout/sidebar.tsx");
  const topbar = source("src/components/layout/topbar.tsx");
  const css = source("src/styles/hh-design-system-v2.css");

  assert.match(shell, /bg-\[var\(--hh-surface-workspace\)\]/);
  assert.match(shell, /bg-\[var\(--hh-surface-canvas\)\]/);
  assert.doesNotMatch(shell, /sm:gap-(?:3|hh-3)/);
  assert.match(shellChrome, /w-hh-sidebar-expanded max-w-\[85vw\]/);
  assert.match(sidebar, /w-hh-sidebar-collapsed/);
  assert.match(sidebar, /w-hh-sidebar-expanded/);
  assert.doesNotMatch(sidebar, /w-\[210px\]|w-\[72px\]/);
  assert.match(sidebar, /aria-label=\{collapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
  assert.match(sidebar, /before:w-\[3px\][^"\n]*before:bg-\[var\(--hh-accent-primary\)\]/);
  assert.doesNotMatch(sidebar, /dark:/);
  assert.match(topbar, /h-14 min-h-14/);
  assert.match(css, /--hh-surface-canvas:\s*var\(--hh-v2-canvas\)/);
  assert.match(css, /--hh-surface-workspace:\s*var\(--hh-v2-workspace\)/);
});

test("Figma v2 content widths preserve narrow and document contexts", () => {
  const css = source("src/app/globals.css");
  const pageLayout = source("src/components/base/page-layout.tsx");

  assert.match(css, /max-width:\s*min\(var\(--hh-content-width-max\), calc\(100vw - 2rem\)\)/);
  assert.match(css, /max-width:\s*min\(var\(--hh-content-width-narrow\), calc\(100vw - 2rem\)\)/);
  assert.match(css, /max-width:\s*min\(var\(--hh-content-width-document\), calc\(100vw - 2rem\)\)/);
  assert.doesNotMatch(css, /max-width:\s*min\((?:1536|1680|1760)px/);
  assert.match(pageLayout, /page-container page-stack[^"\n]*bg-\[var\(--hh-l0-canvas\)\]/);
  assert.match(pageLayout, /data-page-header="true"/);
});

test("Figma v2 global search, create action, and mobile nav use semantic light roles", () => {
  const topbar = source("src/components/layout/topbar.tsx");
  const bottomNav = source("src/components/layout/bottom-nav.tsx");

  assert.match(topbar, /\/\* \+ New[^]*?<DropdownMenuTrigger asChild>\s*<Button\s+size="sm"/);
  assert.match(topbar, /!text-\[var\(--hh-action-primary-foreground\)\]/);
  assert.match(topbar, /bg-\[var\(--hh-surface-subtle\)\]/);
  assert.doesNotMatch(topbar, /data-operational-theme-toggle|<Moon|<Sun/);
  assert.match(
    bottomNav,
    /bg-\[var\(--hh-surface-selected\)\][^"\n]*text-\[var\(--hh-accent-primary\)\]/
  );
  assert.match(bottomNav, /min-h-\[44px\]/);
});
