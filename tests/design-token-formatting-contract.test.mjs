import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import * as prettier from "prettier";

const ROOT = process.cwd();
const IGNORE_PATH = resolve(ROOT, ".prettierignore");

async function isIgnored(path) {
  const info = await prettier.getFileInfo(resolve(ROOT, path), { ignorePath: IGNORE_PATH });
  return info.ignored;
}

test("keeps deterministic design-token artifacts generator-owned", async () => {
  for (const artifact of [
    "src/styles/design-tokens.generated.css",
    "src/styles/design-tokens.generated.json",
  ]) {
    assert.equal(await isIgnored(artifact), true, `${artifact} must be formatter-exempt`);
  }
});

test("keeps authored design-token sources and consumers formatter-owned", async () => {
  for (const authoredFile of [
    "scripts/design-token-sync-lib.mjs",
    "scripts/design-token-sync.mjs",
    "src/app/globals.css",
    "tailwind.config.ts",
    "tests/design-geometry-contract.test.mjs",
    "tests/design-token-sync-contract.test.mjs",
  ]) {
    assert.equal(await isIgnored(authoredFile), false, `${authoredFile} must remain formatted`);
  }
});
