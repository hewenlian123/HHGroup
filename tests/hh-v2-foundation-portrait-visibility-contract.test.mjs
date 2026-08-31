import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function blocksAt(css, marker) {
  const blocks = [];
  let cursor = 0;

  while (cursor < css.length) {
    const markerIndex = css.indexOf(marker, cursor);
    if (markerIndex === -1) break;

    const openBrace = css.indexOf("{", markerIndex);
    assert.notEqual(openBrace, -1, `Missing opening brace for: ${marker}`);

    let depth = 0;
    for (let index = openBrace; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") depth -= 1;
      if (depth === 0) {
        blocks.push(css.slice(openBrace + 1, index));
        cursor = index + 1;
        break;
      }
    }
  }

  assert.notEqual(blocks.length, 0, `Missing CSS block: ${marker}`);
  return blocks;
}

function builderPortraitBlock(css) {
  const blocks = blocksAt(css, "@media (min-width: 768px) and (max-width: 1199px)");
  const block = blocks.find((candidate) => candidate.includes(".eb-scope-builder-region"));
  assert.ok(block, "Missing Estimate builder portrait media block");
  return block;
}

test("Estimate portrait builder swaps the mobile child for the desktop-grid child", () => {
  const css = source("src/app/estimates/_components/estimate-builder-operational.css");
  const editor = source("src/app/estimates/_components/estimate-editor.tsx");
  const portrait = builderPortraitBlock(css);

  assert.match(editor, /className="mb-4 space-y-3 lg:hidden"/);
  assert.match(editor, /className="hidden lg:block"/);
  assert.match(
    portrait,
    /\.estimate-builder-new \.eb-scope-builder-region > \.lg\\:hidden\s*\{\s*display:\s*none;\s*\}/
  );
  assert.match(
    portrait,
    /\.estimate-builder-new \.eb-scope-builder-region > \.hidden\.lg\\:block\s*\{\s*display:\s*block;\s*\}/
  );
});

test("Estimate portrait builder retains the 44px header and 52px line-row tokens", () => {
  const css = source("src/app/estimates/_components/estimate-builder-operational.css");
  const portrait = builderPortraitBlock(css);

  assert.match(
    portrait,
    /\.eb-line-item-grid-header[^{]*\{[^}]*height:\s*var\(--hh-row-height-portrait-grid-header\);[^}]*min-height:\s*var\(--hh-row-height-portrait-grid-header\);/
  );
  assert.match(
    portrait,
    /\.eb-scope-section-lines \.eb-line-item-card[^{]*\{[^}]*height:\s*var\(--hh-row-height-portrait-line-item\);[^}]*min-height:\s*var\(--hh-row-height-portrait-line-item\);/
  );
});
