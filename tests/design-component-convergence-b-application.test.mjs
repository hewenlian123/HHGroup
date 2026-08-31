import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const ROOT = process.cwd();

function compileBatchBStyles() {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "hh-batch-b-contract-"));
  const contentPath = join(fixtureDirectory, "content.html");
  const outputPath = join(fixtureDirectory, "output.css");
  const markup = `
    <section class="rounded-hh-panel border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-panel-standard shadow-operational"></section>
    <span class="border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]"></span>
    <div class="hh-focus-ring min-h-hh-touch bg-[var(--hh-l3-selected)]"></div>
    <span class="hh-fin text-hh-financial text-[var(--hh-text-primary)]"></span>
  `;
  writeFileSync(contentPath, markup, "utf8");

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

test("Batch B V2 surfaces, status, neutral FIN, and rows compute across responsive widths", async (t) => {
  const css = compileBatchBStyles();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();

  await page.setContent(`
    <style>${css}</style>
    <section data-panel class="rounded-hh-panel border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-panel-standard shadow-operational">Panel</section>
    <span data-status class="border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]">Approved</span>
    <div data-row data-state="selected" role="button" tabindex="0" class="hh-focus-ring min-h-hh-touch bg-[var(--hh-l3-selected)]">Open row</div>
    <span data-amount class="hh-fin text-hh-financial text-[var(--hh-text-primary)]">$1,234.56</span>
    <script>
      window.activations = 0;
      document.querySelector('[data-row]').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.activations += 1;
        }
      });
    </script>
  `);
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
    const styles = await page.evaluate(() => {
      const resolveColor = (token) => {
        const reference = document.createElement("span");
        reference.style.color = `var(${token})`;
        document.body.append(reference);
        const color = getComputedStyle(reference).color;
        reference.remove();
        return color;
      };
      const panel = getComputedStyle(document.querySelector("[data-panel]"));
      const status = getComputedStyle(document.querySelector("[data-status]"));
      const row = document.querySelector("[data-row]");
      const rowStyles = getComputedStyle(row);
      const amount = getComputedStyle(document.querySelector("[data-amount]"));
      return {
        tokens: {
          l2: resolveColor("--hh-l2-operational-surface"),
          selected: resolveColor("--hh-l3-selected"),
          success: resolveColor("--hh-success"),
          successBorder: resolveColor("--hh-success-border"),
          successFill: resolveColor("--hh-success-soft-fill"),
          textPrimary: resolveColor("--hh-text-primary"),
        },
        panel: {
          background: panel.backgroundColor,
          radius: panel.borderRadius,
          shadow: panel.boxShadow,
        },
        status: {
          background: status.backgroundColor,
          border: status.borderColor,
          color: status.color,
        },
        row: {
          background: rowStyles.backgroundColor,
          height: row.getBoundingClientRect().height,
        },
        amount: {
          color: amount.color,
          features: amount.fontFeatureSettings,
          variant: amount.fontVariantNumeric,
        },
      };
    });

    assert.equal(styles.panel.background, styles.tokens.l2, `${viewport.name} panel`);
    assert.equal(styles.panel.radius, "8px", `${viewport.name} panel radius`);
    assert.notEqual(styles.panel.shadow, "none", `${viewport.name} panel shadow`);
    assert.equal(
      styles.status.background,
      styles.tokens.successFill,
      `${viewport.name} status fill`
    );
    assert.equal(
      styles.status.border,
      styles.tokens.successBorder,
      `${viewport.name} status border`
    );
    assert.equal(styles.status.color, styles.tokens.success, `${viewport.name} status text`);
    assert.equal(styles.row.background, styles.tokens.selected, `${viewport.name} selected row`);
    assert.ok(styles.row.height >= 44, `${viewport.name} touch row`);
    assert.equal(styles.amount.color, styles.tokens.textPrimary, `${viewport.name} neutral amount`);
    assert.match(styles.amount.variant, /tabular-nums/);
    assert.match(styles.amount.features, /"tnum"(?: 1)?/);
  }

  await page.locator("[data-row]").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  assert.equal(await page.evaluate(() => window.activations), 2);
});
