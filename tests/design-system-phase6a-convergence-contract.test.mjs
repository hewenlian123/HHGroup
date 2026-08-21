import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

function authoredSources(directory) {
  return readdirSync(resolve(ROOT, directory), { recursive: true })
    .filter((path) => typeof path === "string" && [".ts", ".tsx", ".css"].includes(extname(path)))
    .map((path) => join(directory, path));
}

function namedTailwindBlock(tailwind, name, nextName) {
  const start = tailwind.indexOf(`"${name}":`);
  const end = tailwind.indexOf(`"${nextName}":`, start + name.length + 3);
  assert.notEqual(start, -1, `missing Tailwind block ${name}`);
  assert.notEqual(end, -1, `missing Tailwind boundary ${nextName}`);
  return tailwind.slice(start, end);
}

test("Phase 6A removes zero-consumer Neo exports and the obsolete Sonner adapter", () => {
  const src = authoredSources("src").map(source).join("\n");

  assert.doesNotMatch(src, /\bNeoDatePicker\b/);
  assert.doesNotMatch(src, /\bNeoDrawer\b/);
  assert.equal(existsSync(resolve(ROOT, "src/lib/sonner-toast.ts")), false);
});

test("Phase 6A leaves one toast system and removes conclusively unused UI dependencies", () => {
  const packageJson = JSON.parse(source("package.json"));
  const runtime = authoredSources("src").map(source).join("\n");

  for (const dependency of [
    "react-hot-toast",
    "sonner",
    "isomorphic-dompurify",
    "next-themes",
    "react-zoom-pan-pinch",
  ]) {
    assert.equal(
      packageJson.dependencies?.[dependency],
      undefined,
      `${dependency} remains installed`
    );
    assert.doesNotMatch(runtime, new RegExp(dependency.replaceAll("-", "\\-")));
  }

  assert.equal((runtime.match(/<ToastProvider>/g) ?? []).length, 1);
  assert.doesNotMatch(runtime, /HotToaster|data-sonner-toaster|data-hot-toast/);
});

test("Phase 6A migrates active legacy shadow consumers before removing aliases", () => {
  const css = source("src/app/globals.css");
  const runtime = authoredSources("src").map(source).join("\n");

  assert.doesNotMatch(css, /--shadow-(?:0|1|2|popover):/);
  assert.doesNotMatch(runtime, /var\(--shadow-(?:0|1|2|popover)\)/);

  for (const [path, role] of [
    ["src/components/pwa-install-prompt.tsx", "floating"],
    ["src/app/labor/advances/worker-advance-actions-menu.tsx", "floating"],
    ["src/app/labor/payments/page.tsx", "floating"],
    ["src/app/tasks/page.tsx", "floating"],
    ["src/app/estimates/_components/estimate-section-title-menu.tsx", "task"],
  ]) {
    assert.match(source(path), new RegExp(`(?:^|\\s)shadow-${role}(?:\\s|$|["'])`));
  }
});

test("Phase 6A removes unconsumed global dimension and typography aliases", () => {
  const css = source("src/app/globals.css");

  for (const alias of [
    "space-0",
    "space-12",
    "radius-sm",
    "radius-md",
    "radius-lg",
    "radius-xl",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "font-size-lg",
    "font-size-xl",
    "line-height-tight",
    "line-height-normal",
  ]) {
    assert.doesNotMatch(css, new RegExp(`--${alias}:`), `${alias} remains globally defined`);
  }
});

test("Phase 6A removes obsolete Tailwind palette, radius, and shadow authority", () => {
  const tailwind = source("tailwind.config.ts");
  const showcase = source("src/app/design-system/page.tsx");

  assert.doesNotMatch(tailwind, /brand:\s*\{|status:\s*\{|money:\s*\{/);
  assert.doesNotMatch(tailwind, /graphite:\s*\{|gold:\s*\{|emerald:\s*\{|titanium:\s*\{/);
  assert.doesNotMatch(tailwind, /card:\s*"12px"|modal:\s*"14px"/);
  assert.doesNotMatch(tailwind, /"paper-card":|"summary-card":|modal:\s*"0 12px/);
  assert.doesNotMatch(showcase, /brand\.primary|neo\.graphite|bg-brand|bg-neo-graphite/);
});

test("Phase 6A shared motion uses restrained state transitions without scale or broad transition-all", () => {
  const motion = source("src/lib/motion-system.ts");
  const globals = source("src/app/globals.css");
  const tailwind = source("tailwind.config.ts");

  assert.doesNotMatch(motion, /transition-all|hover:-translate|active:scale|hover:scale/);
  assert.doesNotMatch(
    globals,
    /active:!scale|@apply\s+-translate-y-px|@apply\s+scale-\[|@apply\s+scale-\[1\.02\]|backdrop-filter:\s*blur\((?:14|18)px\)/
  );

  for (const [name, nextName] of [
    ["toast-in", "toast-out"],
    ["hh-dialog-in", "hh-dialog-out"],
    ["hh-dialog-out", "hh-command-dialog-in"],
    ["hh-command-dialog-in", "hh-command-dialog-out"],
    ["hh-command-dialog-out", "hh-modal-fade-in"],
    ["hh-panel-dialog-in", "hh-panel-dialog-out"],
    ["hh-panel-dialog-out", "hh-sheet-in"],
  ]) {
    assert.doesNotMatch(namedTailwindBlock(tailwind, name, nextName), /scale\(/, `${name} scales`);
  }
});

test("Phase 6A shared application chrome no longer consumes graphite or gold visual authority", () => {
  const sharedChrome = [
    "src/components/layout/sidebar.tsx",
    "src/components/layout/topbar.tsx",
    "src/components/layout/bottom-nav.tsx",
    "src/components/layout/floating-action-button.tsx",
    "src/components/mobile/mobile-list-chrome.tsx",
    "src/components/command/neo-command-palette.tsx",
  ]
    .map(source)
    .join("\n");

  assert.doesNotMatch(sharedChrome, /neo-(?:gold|graphite)/);
  assert.doesNotMatch(
    sharedChrome,
    /rgb\(184_147_90|active:scale|hover:-translate|transition-all|backdrop-blur/
  );
  assert.doesNotMatch(source("src/components/command/neo-command-palette.tsx"), /"dark fixed/);
});

test("Phase 6A retains only direct semantic compatibility aliases where ownership is unambiguous", () => {
  const css = source("src/app/globals.css");

  assert.match(css, /--neo-emerald:\s*var\(--hh-success\);/);
  assert.match(css, /--neo-emerald-soft:\s*var\(--hh-success-soft-fill\);/);
  assert.match(css, /--neo-gold-ring:\s*var\(--hh-focus-ring\);/);
});

test("Phase 6A retains no Neo compatibility alias without a runtime consumer", () => {
  const css = source("src/app/globals.css");
  const runtime = authoredSources("src").map(source).join("\n");
  const declaredAliases = [
    ...new Set([...css.matchAll(/(--neo-[a-z0-9-]+)\s*:/g)].map((match) => match[1])),
  ].sort();
  const zeroConsumerAliases = declaredAliases.filter(
    (alias) => !new RegExp(`var\\(${alias}\\)`).test(runtime)
  );

  assert.deepEqual(zeroConsumerAliases, []);
});

test("Phase 6A removes global Dashboard gold, lift, scale, and raw shadow authority", () => {
  const css = source("src/app/globals.css");
  const start = css.indexOf(".dashboard-command-hero");
  const end = css.indexOf(".neo-workspace-canvas", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const dashboard = css.slice(start, end);

  assert.doesNotMatch(dashboard, /hud-gold|#b8935a|#d2b77f|rgb\(184 147 90/);
  assert.doesNotMatch(dashboard, /translateY\(-1px\)|scale\(0\.97\)/);
  assert.doesNotMatch(dashboard, /0 22px 52px|0 16px 38px/);
});
