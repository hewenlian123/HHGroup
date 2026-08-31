import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the final text-entry utility owns body weight at the later globals boundary", () => {
  const globals = source("src/app/globals.css");
  const blocks = [...globals.matchAll(/\.hh-type-text-entry\s*\{([^}]*)\}/g)].map(
    (match) => match[1]
  );

  assert.ok(blocks.length >= 2, "expected both V2 and globals text-entry ownership blocks");
  const finalBlock = blocks.at(-2) ?? "";
  assert.match(finalBlock, /font-weight:\s*var\(--hh-type-body-font-weight\)/);
  assert.doesNotMatch(finalBlock, /--hh-type-control-font-weight/);
});

test("shared six-pixel and pill radii are token-owned", () => {
  const tokens = source("src/styles/hh-design-system-v2.css");
  const config = source("tailwind.config.ts");
  const status = source("src/components/base/status-badge.tsx");
  const sharedShell = [
    source("src/components/layout/bottom-nav.tsx"),
    source("src/components/layout/sidebar.tsx"),
    source("src/components/layout/topbar.tsx"),
  ].join("\n");

  assert.match(tokens, /--hh-radius-pill:\s*999px;/);
  assert.match(config, /"hh-pill":\s*"var\(--hh-radius-pill\)"/);
  assert.match(status, /h-\[26px\].*!rounded-hh-pill.*text-hh-status/s);
  assert.doesNotMatch(status, /rounded-\[999px\]/);
  assert.match(sharedShell, /rounded-hh-standard/);
  assert.doesNotMatch(sharedShell, /rounded-\[6px\]/);
});

test("AppShell renders one lexical ToastProvider through one local provider wrapper", () => {
  const shell = source("src/components/layout/app-shell.tsx");

  assert.match(
    shell,
    /function AppShellProviders[\s\S]*?<ToastProvider>[\s\S]*?<AttachmentPreviewProvider>[\s\S]*?\{children\}[\s\S]*?<\/AttachmentPreviewProvider>[\s\S]*?<\/ToastProvider>/
  );
  assert.equal((shell.match(/<ToastProvider>/g) ?? []).length, 1);
  assert.equal((shell.match(/<AttachmentPreviewProvider>/g) ?? []).length, 1);
  assert.equal((shell.match(/<AppShellProviders>/g) ?? []).length, 2);
});

test("the Estimate portrait topbar consumes authority-backed body typography", () => {
  const topbar = source("src/components/layout/topbar.tsx");

  assert.match(topbar, /className=\{cn\("ml-1",\s*TYPO\.bodyStrong\)\}>\{orgName\}<\/span>/);
  assert.match(
    topbar,
    /className=\{cn\(\s*TYPO\.body,\s*"[^"]*rounded-hh-standard[^"]*"\s*\)\}[\s\S]*?>\s*Search/s
  );
  assert.doesNotMatch(topbar, /text-\[14px\]/);
});
