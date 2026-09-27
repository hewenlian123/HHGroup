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
  "page-title": {
    mobile: ["24px", "30px"],
    desktop: ["24px", "30px"],
    weight: "600",
    trackingPx: 0,
  },
  "section-title": {
    mobile: ["16px", "22px"],
    desktop: ["16px", "22px"],
    weight: "600",
    trackingPx: 0,
  },
  "panel-title": {
    mobile: ["14px", "20px"],
    desktop: ["14px", "20px"],
    weight: "500",
    trackingPx: 0,
  },
  body: {
    mobile: ["14px", "20px"],
    desktop: ["14px", "20px"],
    weight: "400",
    trackingPx: 0,
  },
  "body-strong": {
    mobile: ["14px", "20px"],
    desktop: ["14px", "20px"],
    weight: "500",
    trackingPx: 0,
  },
  label: {
    mobile: ["12px", "16px"],
    desktop: ["12px", "16px"],
    weight: "500",
    trackingPx: 0.1,
  },
  metadata: {
    mobile: ["11px", "14px"],
    desktop: ["11px", "14px"],
    weight: "500",
    trackingPx: 0.2,
  },
  "table-header": {
    mobile: ["11px", "14px"],
    desktop: ["11px", "14px"],
    weight: "500",
    trackingPx: 0.2,
  },
  "table-cell": {
    mobile: ["13px", "18px"],
    desktop: ["13px", "18px"],
    weight: "400",
    trackingPx: 0,
  },
  financial: {
    mobile: ["14px", "20px"],
    desktop: ["14px", "20px"],
    weight: "500",
    trackingPx: 0,
  },
  "financial-total": {
    mobile: ["20px", "24px"],
    desktop: ["20px", "24px"],
    weight: "600",
    trackingPx: 0,
  },
  control: {
    mobile: ["12px", "16px"],
    desktop: ["12px", "16px"],
    weight: "500",
    trackingPx: 0.1,
  },
  helper: {
    mobile: ["11px", "14px"],
    desktop: ["11px", "14px"],
    weight: "400",
    trackingPx: 0,
  },
  error: {
    mobile: ["11px", "14px"],
    desktop: ["11px", "14px"],
    weight: "500",
    trackingPx: 0,
  },
  status: {
    mobile: ["11px", "14px"],
    desktop: ["11px", "14px"],
    weight: "500",
    trackingPx: 0.2,
  },
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
      .join(
        ""
      )}<input class="hh-type-text-entry"><span class="hh-fin"></span><section class="estimate-a4-page"></section><section class="invoice-a4-page"></section><section class="payroll-statement-print-root"></section></main>\n`,
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

test("compiled shared typography produces the Certified V2 Geist matrix and FIN contract", async (t) => {
  const compiledCss = compileTypographyCss();
  const tokenCss = source("src/styles/design-tokens.generated.css");
  const rootLayout = source("src/app/layout.tsx");
  const workerStatementPrint = source("src/app/workers/[id]/statement/print/page.tsx");
  const roles = Object.keys(typographyMatrix);
  const htmlOpeningTag = rootLayout.slice(
    rootLayout.indexOf("<html"),
    rootLayout.indexOf(">", rootLayout.indexOf("<html")) + 1
  );
  const rootOwnsNextFontVariables = /geistSans\.variable/.test(htmlOpeningTag);
  const workerStatementOwnsPrintException =
    /className="[^"]*\bpayroll-statement-print-root\b[^"]*"/.test(workerStatementPrint);
  const nextFontClasses = "next-geist-contract next-inter-contract";

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
    <html class="${rootOwnsNextFontVariables ? nextFontClasses : ""}">
      <head>
        <style>
          .next-geist-contract { --font-geist-sans: "Geist Contract"; }
          .next-inter-contract { --font-inter: "Inter Contract"; }
          ${tokenCss}\n${compiledCss}
        </style>
      </head>
      <body class="${rootOwnsNextFontVariables ? "" : nextFontClasses}">
        <main>
          ${roles.map((role) => `<div data-type="${role}" class="text-hh-${role}">HH</div>`).join("\n")}
          <input data-type="text-entry" class="hh-type-text-entry" value="HH">
          <span data-type="fin" class="hh-fin">1000-08-20</span>
          <section data-type="estimate-document" class="estimate-a4-page">Estimate</section>
          <section data-type="invoice-document" class="invoice-a4-page">Invoice</section>
          <section
            data-type="worker-statement-document"
            class="${workerStatementOwnsPrintException ? "payroll-statement-print-root" : "worker-statement-print-fixture"}"
          >Worker Statement</section>
        </main>
      </body>
    </html>
  `);

  const ownership = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      semanticToken: root.getPropertyValue("--hh-font-family-sans").trim(),
      bodyFontFamily: body.fontFamily,
    };
  });
  assert.match(ownership.semanticToken, /^"?Geist Contract"?/);
  assert.match(ownership.bodyFontFamily, /^"?Geist Contract"?/);
  assert.doesNotMatch(ownership.bodyFontFamily, /Times/i);
  t.diagnostic(`computed root semantic token: ${ownership.semanticToken}`);
  t.diagnostic(`computed operational body font-family: ${ownership.bodyFontFamily}`);

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 834, height: 1112 },
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
      const responsiveMode = viewport.width < 768 ? "mobile" : "desktop";
      const expected = typographyMatrix[role][responsiveMode];
      assert.deepEqual([styles.fontSize, styles.lineHeight], expected, `${viewport.name} ${role}`);
      assert.equal(styles.fontWeight, typographyMatrix[role].weight, `${viewport.name} ${role}`);
      const expectedTracking = typographyMatrix[role].trackingPx;
      const actualTracking =
        styles.letterSpacing === "normal" ? 0 : Number.parseFloat(styles.letterSpacing);
      assert.ok(
        Math.abs(actualTracking - expectedTracking) < 0.01,
        `${viewport.name} ${role} letter spacing mismatch`
      );
      assert.match(styles.fontFamily, /^"?Geist Contract"?/);
      assert.doesNotMatch(styles.fontFamily, /Times/i);
    }

    const textEntry = await page.locator('[data-type="text-entry"]').evaluate((element) => {
      const computed = getComputedStyle(element);
      return [computed.fontSize, computed.lineHeight, computed.fontWeight];
    });
    assert.deepEqual(
      textEntry,
      viewport.width < 768 ? ["16px", "24px", "400"] : ["14px", "20px", "400"]
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

  for (const documentType of [
    "worker-statement-document",
    "estimate-document",
    "invoice-document",
  ]) {
    const documentFontFamily = await page
      .locator(`[data-type="${documentType}"]`)
      .evaluate((element) => getComputedStyle(element).fontFamily);
    assert.match(documentFontFamily, /^"?Inter Contract"?/, documentType);
    assert.doesNotMatch(
      documentFontFamily,
      /(?:^|,\s*)(?:"?Times(?: New Roman)?"?|serif)(?:,|$)/i,
      documentType
    );
    t.diagnostic(`computed ${documentType} font-family: ${documentFontFamily}`);
  }
});
