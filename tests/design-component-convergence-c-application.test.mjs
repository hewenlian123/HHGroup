import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const ROOT = process.cwd();

function compileBatchCHarness() {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "hh-batch-c-contract-"));
  const entryPath = join(fixtureDirectory, "entry.tsx");
  const bundlePath = join(fixtureDirectory, "bundle.js");
  const outputPath = join(fixtureDirectory, "output.css");

  writeFileSync(
    entryPath,
    `
      import * as React from "react";
      import { createRoot } from "react-dom/client";
      import { ConfirmDialog } from "${resolve(ROOT, "src/components/base/confirm-dialog.tsx")}";
      import { RowActionsMenu } from "${resolve(ROOT, "src/components/base/row-actions-menu.tsx")}";
      import { Combobox } from "${resolve(ROOT, "src/components/ui/combobox.tsx")}";
      import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "${resolve(ROOT, "src/components/ui/tooltip.tsx")}";

      function Harness() {
        const [confirmOpen, setConfirmOpen] = React.useState(false);
        const [selected, setSelected] = React.useState("");
        const [actionCount, setActionCount] = React.useState(0);
        const onConfirm = () => {
          window.__confirmCount = (window.__confirmCount || 0) + 1;
          return new Promise((resolve, reject) => {
            window.__resolveConfirm = resolve;
            window.__rejectConfirm = reject;
          });
        };

        return (
          <main className="space-y-hh-4 p-hh-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button data-tooltip-trigger className="hh-focus-ring min-h-hh-touch">Help</button>
                </TooltipTrigger>
                <TooltipContent>Keyboard help</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="w-64 overflow-hidden border border-[var(--hh-border)] p-hh-2">
              <Combobox
                aria-label="Project"
                options={[
                  { value: "alpha", label: "Alpha" },
                  { value: "bravo", label: "Bravo" },
                ]}
                value={selected}
                onValueChange={setSelected}
              />
              <output data-selected>{selected}</output>
            </div>

            <RowActionsMenu
              ariaLabel="Row actions"
              actions={[{ label: "Open record", onClick: () => setActionCount((count) => count + 1) }]}
            />
            <output data-action-count>{actionCount}</output>

            <button data-confirm-trigger onClick={() => setConfirmOpen(true)}>Delete record</button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Delete record?"
              description="This action is consequential."
              confirmLabel="Delete"
              destructive
              onConfirm={onConfirm}
            />
          </main>
        );
      }

      createRoot(document.getElementById("root")).render(<Harness />);
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
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

test("Batch C V2 keyboard, portal depth, async confirmation, and responsive contracts", async (t) => {
  const { bundle, css } = compileBatchCHarness();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();

  await page.setContent(`<style>${css}</style><div id="root"></div>`);
  await page.addScriptTag({ content: bundle });
  await page.locator("[data-tooltip-trigger]").waitFor();
  await page.evaluate(() => {
    document.documentElement.dataset.hhTheme = "operational-light";
  });

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet-portrait", width: 834, height: 1194 },
    { name: "tablet-landscape", width: 1194, height: 834 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole("combobox", { name: "Project" });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const listbox = page.getByRole("listbox");
    await listbox.waitFor();
    const floating = await listbox.locator("xpath=..").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        background: styles.backgroundColor,
        border: styles.borderColor,
        shadow: styles.boxShadow,
        position: styles.position,
      };
    });
    assert.equal(floating.position, "fixed", `${viewport.name} portaled position`);
    assert.notEqual(floating.shadow, "none", `${viewport.name} floating shadow`);
    assert.notEqual(floating.background, "rgba(0, 0, 0, 0)");
    assert.notEqual(floating.border, "rgba(0, 0, 0, 0)");
    assert.equal(
      await trigger.getAttribute("aria-activedescendant").then(Boolean),
      true,
      `${viewport.name} active descendant`
    );
    await page.keyboard.press("Escape");
    await listbox.waitFor({ state: "detached" });
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Project"
    );
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `${viewport.name} no overflow`
    );
  }

  const tooltipTrigger = page.locator("[data-tooltip-trigger]");
  await tooltipTrigger.focus();
  await page.getByRole("tooltip").waitFor();
  assert.equal(await tooltipTrigger.getAttribute("aria-describedby").then(Boolean), true);
  await page.keyboard.press("Escape");
  await page.getByRole("tooltip").waitFor({ state: "detached" });

  const rowActions = page.getByRole("button", { name: "Row actions" });
  await rowActions.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Open record" }).waitFor();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("[data-action-count]").textContent(), "1");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Row actions"
  );
  assert.equal(await rowActions.evaluate((node) => document.activeElement === node), true);

  const launch = page.locator("[data-confirm-trigger]");
  await launch.focus();
  await launch.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const taskStyles = await dialog.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      background: styles.backgroundColor,
      radius: styles.borderRadius,
      shadow: styles.boxShadow,
    };
  });
  assert.notEqual(taskStyles.background, "rgba(0, 0, 0, 0)");
  assert.notEqual(taskStyles.shadow, "none");
  assert.equal(taskStyles.radius, "8px");

  const confirm = page.getByRole("button", { name: "Delete", exact: true });
  await confirm.click();
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), true, "pending Escape is blocked");
  await page.evaluate(() =>
    document.querySelector('[role="dialog"] button[aria-busy="true"]')?.click()
  );
  assert.equal(
    await page.evaluate(() => window.__confirmCount),
    1,
    "duplicate confirmation blocked"
  );

  await page.evaluate(() => window.__rejectConfirm(new Error("Server rejected the action")));
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").textContent(), /Server rejected/);
  assert.equal(await confirm.isEnabled(), true, "retry restored");

  await confirm.click();
  await page.evaluate(() => window.__resolveConfirm());
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.__confirmCount), 2);
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-confirm-trigger"));
  assert.equal(await launch.evaluate((node) => document.activeElement === node), true);
});
