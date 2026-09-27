import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("reduced motion preserves non-spatial state feedback", () => {
  const globals = source("src/app/globals.css");
  const list = source("src/app/estimates/estimate-list-operational.css");

  assert.doesNotMatch(globals, /(?:animation|transition)-duration:\s*0\.0+1ms\s*!important/);
  assert.doesNotMatch(list, /transition-duration:\s*0\.0+1ms\s*!important/);
  assert.match(globals, /prefers-reduced-motion:\s*reduce[\s\S]*?scroll-behavior:\s*auto/);
});

test("Estimate Preview keeps a visible focus outline in forced colors", () => {
  const globals = source("src/app/globals.css");

  assert.match(
    globals,
    /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.estimate-preview-tool-button:focus-visible[\s\S]*?outline:\s*2px solid CanvasText\s*!important/
  );
});
