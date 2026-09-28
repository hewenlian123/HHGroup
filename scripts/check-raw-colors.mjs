#!/usr/bin/env node
/**
 * Ban raw colors outside src/styles/tokens.css.
 * New violations in scripts/raw-color-enforced.txt fail.
 * New violations elsewhere are warnings so existing pages do not break CI.
 * The baseline must shrink when a listed violation is removed.
 *
 * Usage: node scripts/check-raw-colors.mjs [--write]
 */
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const lib = require("./raw-color-lib.cjs");

const write = process.argv.includes("--write");
const current = lib.scanSourceTree();

if (write) {
  fs.writeFileSync(
    lib.baselinePath(),
    `${JSON.stringify(lib.serializeBaseline(current), null, 2)}\n`
  );
  console.log(`Wrote ${lib.baselinePath()} (${current.size} files with existing violations).`);
  process.exit(0);
}

const baseline = lib.loadBaseline();
const { errors, warnings, stale } = lib.diffViolations(current, baseline);

for (const item of warnings) {
  console.warn(`warn  ${item.file}: ${item.count} new raw color (${item.line})`);
}
for (const item of stale) {
  console.warn(`stale ${item.file}: baseline still lists ${item.count} (${item.line})`);
}
for (const item of errors) {
  console.error(`error ${item.file}: ${item.count} new raw color (${item.line})`);
}

if (stale.length) {
  console.error(
    `\nraw-color baseline has ${stale.length} stale entr${stale.length === 1 ? "y" : "ies"}. Remove them from scripts/raw-color-baseline.json.`
  );
  process.exit(1);
}
if (errors.length) {
  console.error(
    `\n${errors.length} raw-color error${errors.length === 1 ? "" : "s"} in enforced files. Put hex/rgb/hsl only in src/styles/tokens.css.`
  );
  process.exit(1);
}
if (warnings.length) {
  console.warn(
    `\n${warnings.length} raw-color warning${warnings.length === 1 ? "" : "s"} outside the enforced set (not failing CI).`
  );
}
console.log("raw-color check passed.");
