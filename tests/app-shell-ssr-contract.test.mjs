import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("root layout server-renders AppShell instead of deferring it with ssr:false", () => {
  const layout = source("src/app/layout.tsx");

  assert.match(
    layout,
    /import\s+\{\s*AppShell\s*\}\s+from\s+["']@\/components\/layout\/app-shell["']/
  );
  assert.doesNotMatch(layout, /from\s+["']next\/dynamic["']/);
  assert.doesNotMatch(layout, /ssr:\s*false/);
});

test("only interactive chrome is a non-SSR island; the structural shell contains main", () => {
  const shell = source("src/components/layout/app-shell.tsx");
  const appShellBody = shell.match(/export function AppShell\([\s\S]*?\n}\n/)?.[0] ?? "";

  assert.doesNotMatch(appShellBody, /useSearchParams\(/);
  assert.doesNotMatch(shell, /useSearchParams\(/);
  assert.match(
    shell,
    /dynamic\(\s*\(\)\s*=>\s*import\("\.\/app-shell-chrome"\)[\s\S]*?ssr:\s*false/
  );
  assert.match(shell, /<main[\s\S]*?data-app-scroll-root[\s\S]*?>[\s\S]*?\{children\}/);
  assert.match(shell, /data-app-shell-sidebar-slot/);
  assert.match(shell, /data-app-shell-topbar-slot/);
  assert.match(shell, /data-app-shell-bottom-slot/);
  assert.match(
    shell,
    /data-integrated-estimate-workspace=\{\s*integratedEstimateWorkspace \? "true" : undefined\s*\}/
  );
});
