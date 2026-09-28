import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("documents upload file control has an associated label", async () => {
  const documents = await source("src/app/documents/documents-list-client.tsx");

  assert.match(documents, /<label\s+htmlFor="documents-upload-file"[^>]*>/);
  assert.match(documents, /<input\s+id="documents-upload-file"[\s\S]*?type="file"/);
});

test("mobile filters use the HH compact radius token", async () => {
  const mobileChrome = await source("src/components/mobile/mobile-list-chrome.tsx");

  assert.match(
    mobileChrome,
    /className=\{cn\(\s*"h-9 shrink-0 gap-1\.5 rounded-hh-compact px-2\.5",\s*filtersTriggerClassName\s*\)\}/
  );
});
