import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

const typographyMatrix = {
  "page-title": { mobile: ["20px", "26px"], desktop: ["24px", "30px"], weight: "600" },
  "section-title": { mobile: ["16px", "22px"], desktop: ["16px", "22px"], weight: "600" },
  "panel-title": { mobile: ["14px", "20px"], desktop: ["14px", "20px"], weight: "600" },
  body: { mobile: ["14px", "20px"], desktop: ["14px", "20px"], weight: "400" },
  "body-strong": { mobile: ["14px", "20px"], desktop: ["14px", "20px"], weight: "600" },
  label: { mobile: ["12px", "16px"], desktop: ["12px", "16px"], weight: "500" },
  metadata: { mobile: ["12px", "16px"], desktop: ["12px", "16px"], weight: "400" },
  "table-header": { mobile: ["11px", "16px"], desktop: ["11px", "16px"], weight: "600" },
  "table-cell": { mobile: ["13px", "18px"], desktop: ["13px", "18px"], weight: "400" },
  financial: { mobile: ["14px", "20px"], desktop: ["14px", "20px"], weight: "500" },
  "financial-total": { mobile: ["20px", "24px"], desktop: ["20px", "24px"], weight: "600" },
  control: { mobile: ["14px", "20px"], desktop: ["14px", "20px"], weight: "500" },
  helper: { mobile: ["12px", "16px"], desktop: ["12px", "16px"], weight: "400" },
  error: { mobile: ["12px", "16px"], desktop: ["12px", "16px"], weight: "500" },
  status: { mobile: ["11px", "16px"], desktop: ["11px", "16px"], weight: "500" },
};

function compileTypographyCss() {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "hh-typography-contract-"));
  const contentPath = join(fixtureDirectory, "content.html");
  const outputPath = join(fixtureDirectory, "output.css");
  const classes = Object.keys(typographyMatrix).map((role) => `text-hh-${role}`);

  writeFileSync(
    contentPath,
    `<main>${classes
      .map((className, index) => `<div class="${className}" data-role="${index}"></div>`)
      .join("")}<input class="hh-type-text-entry"><span class="hh-fin"></span></main>\n`,
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

test("compiled shared typography produces the exact responsive matrix and FIN contract", async (t) => {
  const compiledCss = compileTypographyCss();
  const tokenCss = source("src/styles/design-tokens.generated.css");
  const roles = Object.keys(typographyMatrix);

  for (const role of roles) {
    assert.match(compiledCss, new RegExp(`\\.text-hh-${role}\\s*\\{`));
    assert.match(
      compiledCss,
      new RegExp(`letter-spacing:\\s*var\\(--hh-type-${role}-letter-spacing\\)`)
    );
  }
  assert.match(compiledCss, /\.hh-fin\s*\{[^}]*font-variant-numeric:\s*var\(--hh-fin-variant\)/s);
  assert.match(
    compiledCss,
    /\.hh-type-text-entry\s*\{[^}]*font-size:\s*var\(--hh-type-text-entry-size-mobile\)/s
  );

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <style>${tokenCss}\n${compiledCss}</style>
    <main>
      ${roles.map((role) => `<div data-type="${role}" class="text-hh-${role}">HH</div>`).join("\n")}
      <input data-type="text-entry" class="hh-type-text-entry" value="HH">
      <span data-type="fin" class="hh-fin">1000-08-20</span>
    </main>
  `);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--font-geist-sans", '"Geist Contract"');
    document.documentElement.style.setProperty("--font-inter", '"Inter Contract"');
  });

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const role of roles) {
      const styles = await page.locator(`[data-type="${role}"]`).evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          fontSize: computed.fontSize,
          lineHeight: computed.lineHeight,
          fontWeight: computed.fontWeight,
          letterSpacing: computed.letterSpacing,
          fontFamily: computed.fontFamily,
        };
      });
      const expected = typographyMatrix[role][viewport.name];
      assert.deepEqual([styles.fontSize, styles.lineHeight], expected, `${viewport.name} ${role}`);
      assert.equal(styles.fontWeight, typographyMatrix[role].weight, `${viewport.name} ${role}`);
      assert.ok(
        styles.letterSpacing === "normal" || styles.letterSpacing === "0px",
        `${viewport.name} ${role} letter spacing is not zero`
      );
      assert.match(styles.fontFamily, /^"?Geist Contract"?/);
    }

    const textEntry = await page.locator('[data-type="text-entry"]').evaluate((element) => {
      const computed = getComputedStyle(element);
      return [computed.fontSize, computed.lineHeight, computed.fontWeight];
    });
    assert.deepEqual(
      textEntry,
      viewport.name === "mobile" ? ["16px", "24px", "500"] : ["14px", "20px", "500"]
    );
  }

  const fin = await page.locator('[data-type="fin"]').evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      fontFamily: computed.fontFamily,
      fontVariantNumeric: computed.fontVariantNumeric,
      fontFeatureSettings: computed.fontFeatureSettings,
    };
  });
  assert.match(fin.fontFamily, /^"?Geist Contract"?/);
  assert.match(fin.fontVariantNumeric, /tabular-nums/);
  assert.match(fin.fontVariantNumeric, /lining-nums/);
  assert.match(fin.fontFeatureSettings, /"tnum"(?: 1)?/);
  assert.match(fin.fontFeatureSettings, /"lnum"(?: 1)?/);
  assert.match(fin.fontFeatureSettings, /"zero" 0/);
});
