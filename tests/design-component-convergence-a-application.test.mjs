import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const ROOT = process.cwd();

function compileBatchAStyles() {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "hh-batch-a-contract-"));
  const contentPath = join(fixtureDirectory, "content.html");
  const outputPath = join(fixtureDirectory, "output.css");

  writeFileSync(
    contentPath,
    '<button class="hh-focus-ring min-h-hh-touch hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]">Action</button>',
    "utf8"
  );

  try {
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
        "--content",
        contentPath,
      ],
      { cwd: ROOT, stdio: "pipe" }
    );
    return readFileSync(outputPath, "utf8");
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

test("Batch A focus and touch contracts compute in both themes and responsive widths", async (t) => {
  const css = compileBatchAStyles();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();

  await page.setContent(
    `<style>${css}</style><button data-action class="hh-focus-ring min-h-hh-touch hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]">Action</button>`
  );

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((nextTheme) => {
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
        document.body.tabIndex = -1;
        document.body.focus();
      }, theme);
      await page.keyboard.press("Tab");

      const styles = await page.locator("[data-action]").evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          outlineColor: computed.outlineColor,
          outlineOffset: computed.outlineOffset,
          outlineStyle: computed.outlineStyle,
          outlineWidth: computed.outlineWidth,
        };
      });

      assert.ok(styles.height >= 44, `${viewport.name} ${theme} touch target`);
      assert.equal(styles.outlineWidth, "2px", `${viewport.name} ${theme} focus width`);
      assert.equal(styles.outlineOffset, "2px", `${viewport.name} ${theme} focus offset`);
      assert.equal(styles.outlineStyle, "solid", `${viewport.name} ${theme} focus style`);
      assert.equal(
        styles.outlineColor,
        theme === "light" ? "rgba(23, 23, 23, 0.32)" : "rgba(242, 242, 239, 0.38)",
        `${viewport.name} ${theme} focus color`
      );
    }
  }
});
