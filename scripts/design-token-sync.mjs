#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultDesignSystemSourcePath,
  parseDesignSystemTokens,
  renderGeneratedCss,
  renderGeneratedJson,
  validateRepositoryWiring,
} from "./design-token-sync-lib.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_ARTIFACT = resolve(REPO_ROOT, "src/styles/design-tokens.generated.css");
const JSON_ARTIFACT = resolve(REPO_ROOT, "src/styles/design-tokens.generated.json");

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!["sync", "check"].includes(command)) {
    throw new Error(
      "Usage: node scripts/design-token-sync.mjs <sync|check> [--source <absolute-path>]"
    );
  }

  let sourcePath = defaultDesignSystemSourcePath();
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== "--source" || !rest[index + 1]) {
      throw new Error(`Unknown or incomplete argument: ${rest[index] ?? "<missing>"}`);
    }
    sourcePath = resolve(rest[index + 1]);
    index += 1;
  }
  return { command, sourcePath };
}

function readRequired(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${label} is unavailable at ${path}: ${error.message}`);
  }
}

function assertExactFile(path, expected, label) {
  const actual = readRequired(path, label);
  if (actual !== expected) {
    throw new Error(`${label} is stale. Run npm run design:sync.`);
  }
}

function main() {
  const { command, sourcePath } = parseArguments(process.argv.slice(2));
  const markdown = readRequired(sourcePath, "Obsidian Design System authority");
  const contract = parseDesignSystemTokens(markdown);
  const generatedCss = renderGeneratedCss(contract);
  const generatedJson = renderGeneratedJson(contract);

  if (command === "sync") {
    writeFileSync(CSS_ARTIFACT, generatedCss, "utf8");
    writeFileSync(JSON_ARTIFACT, generatedJson, "utf8");
    console.log(
      `Synchronized ${contract.tokens.length} themed tokens, ${contract.dimensions.length} invariant geometry tokens, ${contract.typography.length} typography roles, and ${contract.typographyContracts.length} typography contracts from ${sourcePath}.`
    );
    return;
  }

  assertExactFile(CSS_ARTIFACT, generatedCss, "Generated CSS token artifact");
  assertExactFile(JSON_ARTIFACT, generatedJson, "Generated JSON token artifact");
  validateRepositoryWiring({
    globalsCss: readRequired(resolve(REPO_ROOT, "src/app/globals.css"), "globals.css"),
    tailwindConfig: readRequired(resolve(REPO_ROOT, "tailwind.config.ts"), "Tailwind config"),
  });
  console.log(
    `Design token check passed for ${contract.tokens.length} themed tokens, ${contract.dimensions.length} invariant geometry tokens, ${contract.typography.length} typography roles, and ${contract.typographyContracts.length} typography contracts.`
  );
}

try {
  main();
} catch (error) {
  console.error(`Design token sync failed: ${error.message}`);
  process.exitCode = 1;
}
