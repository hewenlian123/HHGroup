import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");
const ambiguousShadow = /shadow-\[var\(--hh-shadow-(operational|floating|task)\)\]/;

const roleSources = {
  operational: [
    "src/components/base/neo-primitives.tsx",
    "src/components/ui/searchable-select.tsx",
    "src/lib/typography.ts",
  ],
  floating: [
    "src/components/ui/creatable-select.tsx",
    "src/components/ui/date-picker.tsx",
    "src/components/ui/dropdown-menu.tsx",
    "src/components/ui/popover.tsx",
    "src/components/ui/searchable-select.tsx",
    "src/components/ui/select.tsx",
    "src/lib/list-table-interaction.ts",
  ],
  task: [
    "src/components/base/confirm-dialog.tsx",
    "src/components/base/drawer.tsx",
    "src/components/base/neo-form.tsx",
    "src/components/ui/dialog.tsx",
    "src/components/ui/sheet.tsx",
  ],
};

function sharedPrimitiveSources() {
  const componentFiles = ["src/components/base", "src/components/ui"].flatMap((directory) =>
    readdirSync(resolve(ROOT, directory), { recursive: true })
      .filter((path) => typeof path === "string" && path.endsWith(".tsx"))
      .map((path) => join(directory, path))
  );

  return [...componentFiles, "src/lib/list-table-interaction.ts", "src/lib/typography.ts"];
}

function compileSemanticShadowUtilities() {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "hh-shadow-contract-"));
  const inputPath = join(fixtureDirectory, "input.css");
  const contentPath = join(fixtureDirectory, "content.html");
  const outputPath = join(fixtureDirectory, "output.css");

  writeFileSync(inputPath, "@tailwind utilities;\n", "utf8");
  writeFileSync(
    contentPath,
    '<div class="shadow-operational shadow-floating shadow-task"></div>\n',
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
        inputPath,
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

test("shared primitives use explicit semantic box-shadow utilities", () => {
  for (const path of sharedPrimitiveSources()) {
    assert.doesNotMatch(source(path), ambiguousShadow, `${path} uses ambiguous shadow syntax`);
  }

  for (const [role, paths] of Object.entries(roleSources)) {
    for (const path of paths) {
      assert.match(source(path), new RegExp(`(?:^|\\s)shadow-${role}(?:\\s|$|[\"'])`));
    }
  }
});

test("compiled semantic utilities produce non-none computed shadows in both themes", async (t) => {
  const compiledCss = compileSemanticShadowUtilities();
  const tokenCss = source("src/styles/design-tokens.generated.css");

  for (const role of Object.keys(roleSources)) {
    const rule = compiledCss.match(new RegExp(`\\.shadow-${role}\\s*\\{([^}]*)\\}`))?.[1];
    assert.ok(rule, `Tailwind did not compile shadow-${role}`);
    assert.match(rule, new RegExp(`--tw-shadow:\\s*var\\(--hh-shadow-${role}\\)`));
    assert.match(rule, /box-shadow:/);
  }

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();

  await page.setContent(`
    <style>${tokenCss}\n${compiledCss}</style>
    ${Object.keys(roleSources)
      .map(
        (role) => `
          <div data-shadow="${role}" class="shadow-${role}"></div>
          <div data-reference="${role}" style="box-shadow: var(--hh-shadow-${role})"></div>
        `
      )
      .join("\n")}
  `);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((nextTheme) => {
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
      }, theme);

      for (const role of Object.keys(roleSources)) {
        const styles = await page.evaluate((shadowRole) => {
          const actual = getComputedStyle(
            document.querySelector(`[data-shadow="${shadowRole}"]`)
          ).boxShadow;
          const reference = getComputedStyle(
            document.querySelector(`[data-reference="${shadowRole}"]`)
          ).boxShadow;
          return { actual, reference };
        }, role);

        assert.notEqual(styles.actual, "none", `${viewport.name} ${theme} ${role} is none`);
        assert.notEqual(
          styles.reference,
          "none",
          `${viewport.name} ${theme} ${role} token is none`
        );
        assert.ok(
          styles.actual.includes(styles.reference),
          `${viewport.name} ${theme} ${role} does not apply its semantic token`
        );
      }
    }
  }
});
