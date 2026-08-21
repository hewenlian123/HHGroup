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

  assert.equal(contract.schemaVersion, 2);
  assert.equal(contract.tokens.length, 24);
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
  assert.deepEqual(
    contract.tokens.filter(({ name }) => name.startsWith("l3-")),
    [
      {
        role: "L3 Interactive Surface",
        name: "l3-hover",
        cssVariable: "--hh-l3-hover",
        light: "#F4F4F2",
        dark: "#222222",
      },
      {
        role: "L3 Interactive Surface",
        name: "l3-selected",
        cssVariable: "--hh-l3-selected",
        light: "#ECECEA",
        dark: "#2C2C2C",
      },
      {
        role: "L3 Interactive Surface",
        name: "l3-pressed",
        cssVariable: "--hh-l3-pressed",
        light: "#E7E7E4",
        dark: "#323232",
      },
    ]
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "l4-floating-surface"),
    {
      role: "L4 Floating Surface",
      name: "l4-floating-surface",
      cssVariable: "--hh-l4-floating-surface",
      light: "#FFFFFF",
      dark: "#252525",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "l5-task-surface"),
    {
      role: "L5 Task Surface",
      name: "l5-task-surface",
      cssVariable: "--hh-l5-task-surface",
      light: "#FFFFFF",
      dark: "#292929",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-operational"),
    {
      role: "Operational Shadow",
      name: "shadow-operational",
      cssVariable: "--hh-shadow-operational",
      light: "0 1px 2px rgb(0 0 0 / 0.04), 0 14px 32px -26px rgb(0 0 0 / 0.24)",
      dark: "0 1px 0 rgb(255 255 255 / 0.025), 0 14px 34px -26px rgb(0 0 0 / 0.84)",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-floating"),
    {
      role: "Floating Shadow",
      name: "shadow-floating",
      cssVariable: "--hh-shadow-floating",
      light: "0 2px 8px -3px rgb(0 0 0 / 0.10), 0 22px 48px -18px rgb(0 0 0 / 0.22)",
      dark: "0 1px 0 rgb(255 255 255 / 0.055), 0 20px 46px -14px rgb(0 0 0 / 0.76)",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-task"),
    {
      role: "Task Shadow",
      name: "shadow-task",
      cssVariable: "--hh-shadow-task",
      light: "0 4px 12px -5px rgb(0 0 0 / 0.12), 0 34px 72px -26px rgb(0 0 0 / 0.28)",
      dark: "0 1px 0 rgb(255 255 255 / 0.065), 0 32px 76px -20px rgb(0 0 0 / 0.92)",
    }
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
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          "0 34px 72px -26px rgb(0 0 0 / 0.28)",
          "0 34px decorative rgb(0 0 0 / 0.28)"
        )
      ),
    /malformed Light value for Task Shadow/i
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
