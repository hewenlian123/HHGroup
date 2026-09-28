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

test("Batch A focus and touch contracts compute in Certified V2 light across responsive widths", async (t) => {
  const css = compileBatchAStyles();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();

  await page.setContent(
    `<style>${css}</style><button data-action class="hh-focus-ring min-h-hh-touch hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]">Action</button>`
  );
  await page.evaluate(() => {
    document.documentElement.dataset.hhTheme = "operational-light";
  });

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });
    await page.keyboard.press("Tab");

    const styles = await page.locator("[data-action]").evaluate((element) => {
      const computed = getComputedStyle(element);
      const reference = document.createElement("span");
      reference.style.color = "var(--hh-focus-ring)";
      document.body.append(reference);
      const focusRing = getComputedStyle(reference).color;
      reference.remove();
      return {
        focusRing,
        height: element.getBoundingClientRect().height,
        outlineColor: computed.outlineColor,
        outlineOffset: computed.outlineOffset,
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
      };
    });

    assert.ok(styles.height >= 44, `${viewport.name} touch target`);
    assert.equal(styles.outlineWidth, "2px", `${viewport.name} focus width`);
    assert.equal(styles.outlineOffset, "2px", `${viewport.name} focus offset`);
    assert.equal(styles.outlineStyle, "solid", `${viewport.name} focus style`);
    assert.equal(styles.outlineColor, styles.focusRing, `${viewport.name} focus token`);
    assert.equal(styles.outlineColor, "rgb(37, 99, 235)", `${viewport.name} certified blue`);
  }
});
