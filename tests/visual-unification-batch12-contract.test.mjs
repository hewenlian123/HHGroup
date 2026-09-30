import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Admin Center pages use the shared list frame and workspace title", () => {
  for (const path of [
    "src/app/system-metrics/page.tsx",
    "src/app/system-logs/page.tsx",
    "src/app/system/backups/page.tsx",
  ]) {
    const page = source(path);
    assert.match(page, /frame="list"/);
    assert.match(page, /variant="workspace"/);
    assert.doesNotMatch(page, /page-container|page-shell-wide/);
  }

  const backups = source("src/app/system/backups/page.tsx");
  assert.match(backups, /text-\[var\(--hh-link\)\]/);
  assert.match(backups, /Create Backup Now/);
  assert.match(backups, /\/api\/system\/backup/);

  assert.match(source("src/app/system-metrics/page.tsx"), /\/api\/system-metrics/);
  assert.match(source("src/app/system-logs/page.tsx"), /\/api\/system-logs/);
});

test("System Guardian uses the list frame, section cards, and navy links", () => {
  const health = source("src/app/system-health/page.tsx");
  assert.match(health, /hh-list-frame/);
  assert.match(health, /bg-\[var\(--hh-l0-canvas\)\]/);
  assert.match(health, /text-title-page text-\[var\(--hh-ink\)\]/);
  assert.match(health, /System Guardian/);
  assert.match(health, /Refresh Now/);
  assert.match(health, /Run full scan/);
  assert.match(health, /Active Issues/);
  assert.match(health, /border-radius:\s*var\(--hh-radius-xl\)/);
  assert.match(health, /border:\s*1px solid var\(--hh-line\)/);
  assert.match(health, /text-\[var\(--hh-link\)\]/);
  assert.doesNotMatch(health, /max-w-7xl|bg-workspace|text-hh-page-title/);
});

test("Design system page chrome uses the list frame", () => {
  const page = source("src/app/design-system/page.tsx");
  assert.match(page, /hh-list-frame/);
  assert.match(page, /variant="workspace"/);
  assert.doesNotMatch(page, /page-container/);
});
