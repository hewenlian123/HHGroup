import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

async function loadContract() {
  try {
    return await import("../scripts/design-token-sync-lib.mjs");
  } catch (error) {
    assert.fail(`Design token sync contract is not implemented: ${error.message}`);
  }
}

test("parses the current Design System v1 color contract", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const contract = parseDesignSystemTokens(markdown);

  assert.equal(contract.tokens.length, 16);
  assert.deepEqual(contract.tokens[0], {
    role: "L0 Canvas",
    name: "l0-canvas",
    cssVariable: "--hh-l0-canvas",
    light: "#F7F7F6",
    dark: "#0A0A0A",
  });
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "action-primary-foreground"),
    {
      role: "Action primary",
      name: "action-primary-foreground",
      cssVariable: "--hh-action-primary-foreground",
      light: "#FFFFFF",
      dark: "#161616",
    }
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "border-floating").light,
    "rgb(22 22 22 / 12%)"
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "border-strong").dark,
    "rgb(255 255 255 / 17%)"
  );
});

test("fails closed for missing, duplicate, malformed, and incomplete authority rows", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const warningRow = markdown.match(/^\| Warning \|.*$/m)?.[0];

  assert.ok(warningRow, "expected the authority Warning row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${warningRow}\n`, "")),
    /missing required token role: Warning/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(warningRow, `${warningRow}\n${warningRow}`)),
    /duplicate token role: Warning/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace("`#A16207`", "`#NOTHEX`")),
    /malformed Light value for Warning/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(warningRow, "| Warning | `#A16207` |  | Attention. |")
      ),
    /incomplete Light\/Dark pair for Warning/i
  );
});

test("generated artifacts exactly equal the authoritative model", async () => {
  const {
    defaultDesignSystemSourcePath,
    parseDesignSystemTokens,
    renderGeneratedCss,
    renderGeneratedJson,
  } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const contract = parseDesignSystemTokens(markdown);

  assert.equal(source("src/styles/design-tokens.generated.css"), renderGeneratedCss(contract));
  assert.equal(source("src/styles/design-tokens.generated.json"), renderGeneratedJson(contract));
});

test("globals and Tailwind consume canonical tokens while compatibility aliases remain wired", async () => {
  const { validateRepositoryWiring } = await loadContract();

  assert.doesNotThrow(() =>
    validateRepositoryWiring({
      globalsCss: source("src/app/globals.css"),
      tailwindConfig: source("tailwind.config.ts"),
    })
  );
});
