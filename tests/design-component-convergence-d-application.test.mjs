import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const ROOT = process.cwd();

function compileBatchDHarness() {
  const directory = mkdtempSync(join(tmpdir(), "hh-batch-d-contract-"));
  const entryPath = join(directory, "entry.tsx");
  const bundlePath = join(directory, "bundle.js");
  const outputPath = join(directory, "output.css");

  writeFileSync(
    entryPath,
    `
      import * as React from "react";
      import { createRoot } from "react-dom/client";
      import { ToastProvider, useToast } from "${resolve(ROOT, "src/components/toast/toast-provider.tsx")}";
      import { InlineFeedback } from "${resolve(ROOT, "src/components/ui/feedback.tsx")}";
      import { ErrorRetry, LoadingState, NoResults, PermissionDenied } from "${resolve(ROOT, "src/components/ui/system-state.tsx")}";
      import { Skeleton } from "${resolve(ROOT, "src/components/ui/skeleton.tsx")}";
      import { publishToast, toast } from "${resolve(ROOT, "src/lib/toast.ts")}";

      function Controls() {
        const { toast: notify } = useToast();
        return (
          <main className="space-y-hh-4 p-hh-4">
            <button data-hook onClick={() => notify({ title: "Saved", variant: "success", durationMs: 60000 })}>Hook success</button>
            <button data-adapter onClick={() => toast.error("Save failed", "Try again", 60000)}>Adapter error</button>
            <button data-action onClick={() => publishToast({ title: "Review item", variant: "warning", durationMs: 60000, onClick: () => { window.__toastAction = (window.__toastAction || 0) + 1; } })}>Action toast</button>
            <InlineFeedback title="Information" description="Shared semantic feedback" />
            <LoadingState text="Loading records" />
            <NoResults />
            <ErrorRetry onRetry={() => { window.__retried = true; }} />
            <PermissionDenied />
            <Skeleton data-skeleton className="h-8 w-32" />
          </main>
        );
      }

      createRoot(document.getElementById("root")).render(
        <ToastProvider><Controls /></ToastProvider>
      );
    `,
    "utf8"
  );

  try {
    buildSync({
      absWorkingDir: ROOT,
      bundle: true,
      entryPoints: [entryPath],
      format: "iife",
      jsx: "automatic",
      nodePaths: [resolve(ROOT, "node_modules")],
      outfile: bundlePath,
      platform: "browser",
      tsconfig: resolve(ROOT, "tsconfig.json"),
    });
    execFileSync(
      process.execPath,
      [
        resolve(ROOT, "node_modules/tailwindcss/lib/cli.js"),
        "--config",
        resolve(ROOT, "tailwind.config.ts"),
        "--input",
        resolve(ROOT, "src/app/globals.css"),
        "--output",
        outputPath,
      ],
      { cwd: ROOT, stdio: "pipe" }
    );
    return {
      bundle: readFileSync(bundlePath, "utf8"),
      css: readFileSync(outputPath, "utf8"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Batch D owns one live region, semantic feedback, busy state, and responsive toast behavior", async (t) => {
  const { bundle, css } = compileBatchDHarness();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<style>${css}</style><div id="root"></div>`);
  await page.addScriptTag({ content: bundle });
  await page.locator("[data-hook]").waitFor();

  assert.equal(await page.locator('[aria-label="Notifications"][aria-live]').count(), 1);
  assert.equal(await page.locator('[aria-busy="true"]').count(), 1);
  assert.equal(await page.locator("[data-skeleton]").getAttribute("aria-hidden"), "true");

  await page.locator("[data-hook]").click();
  await page.locator("[data-adapter]").click();
  await page.locator("[data-action]").click();
  assert.equal(await page.locator("[data-toast]").count(), 3, "one toast per API call");

  const actionToast = page.locator('[data-toast][aria-label^="Warning:"]');
  await actionToast.getByRole("button", { name: /Review item/ }).click();
  assert.equal(await page.evaluate(() => window.__toastAction), 1);
  assert.equal(await page.locator("[data-toast]").count(), 2, "action dismisses its toast once");

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet-portrait", width: 834, height: 1194 },
    { name: "tablet-landscape", width: 1194, height: 834 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((nextTheme) => {
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
      }, theme);
      await page.evaluate(
        () =>
          new Promise((resolveFrame) =>
            requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
          )
      );
      const result = await page.evaluate(() => {
        const resolveColor = (token) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const success = document.querySelector('[data-toast][aria-label^="Success:"]');
        const danger = document.querySelector('[data-toast][aria-label^="Error:"]');
        const dismiss = danger.querySelector('button[aria-label^="Dismiss"]');
        return {
          successColor: getComputedStyle(success).color,
          successVariable: getComputedStyle(success).getPropertyValue("--hh-success"),
          successToken: resolveColor("--hh-success"),
          dangerColor: getComputedStyle(danger).color,
          dangerToken: resolveColor("--hh-danger"),
          animation: getComputedStyle(danger).animationName,
          dismissHeight: dismiss.getBoundingClientRect().height,
          noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      assert.equal(
        result.successColor,
        result.successToken,
        `${viewport.name} ${theme} success (${result.successVariable})`
      );
      assert.equal(result.dangerColor, result.dangerToken, `${viewport.name} ${theme} danger`);
      assert.equal(result.animation, "none", `${viewport.name} ${theme} reduced motion`);
      assert.equal(result.noOverflow, true, `${viewport.name} ${theme} no overflow`);
      if (viewport.name === "mobile") assert.ok(result.dismissHeight >= 44, "mobile dismiss touch");
    }
  }

  await page.getByRole("button", { name: "Try again" }).click();
  assert.equal(await page.evaluate(() => window.__retried), true);
  await page.getByRole("button", { name: /Dismiss error notification/ }).click();
  assert.equal(await page.locator("[data-toast]").count(), 1);
});
