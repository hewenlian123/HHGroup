#!/usr/bin/env node
/**
 * Mechanical class migrations toward tailwind semantic tokens.
 * Run: node scripts/unify-ui-color-classes.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src");

/** @type {[RegExp, string][]} */
const REPLACEMENTS = [
  [/\bbg-\[#F8F7F4\]/g, "bg-page"],
  [/\bbg-\[#f8f7f4\]/g, "bg-page"],
  [/\bbg-warm-grey\b/g, "bg-page"],
  [/\btext-\[#111827\]/g, "text-text-primary"],
  [/\btext-\[#6B7280\]/g, "text-text-secondary"],
  [/\btext-\[#6b7280\]/g, "text-text-secondary"],
  [/\btext-gray-900\b/g, "text-text-primary"],
  [/\btext-gray-950\b/g, "text-text-primary"],
  [/\bdark:text-gray-100\b/g, "dark:text-text-primary"],
  [/\btext-gray-500\b/g, "text-text-secondary"],
  [/\btext-gray-600\b/g, "text-text-secondary"],
  [/\bdark:text-gray-400\b/g, "dark:text-text-secondary"],
  [/\bdark:text-gray-500\b/g, "dark:text-text-secondary"],
  [/\btext-gray-700\b/g, "text-text-primary"],
  [/\btext-gray-800\b/g, "text-text-primary"],
  [/\bplaceholder:text-gray-400\b/g, "placeholder:text-text-secondary"],
  [/\bplaceholder:text-gray-500\b/g, "placeholder:text-text-secondary"],
  [/\btext-\[#d92d20\]/g, "text-money-expense"],
  [/\btext-gray-400\b/g, "text-text-secondary/75"],
  [/\bborder-\[#E5E7EB\]/g, "border-gray-300"],
  [/\bborder-\[#e5e7eb\]/g, "border-gray-300"],
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".next") continue;
      walk(p, acc);
    } else if (/\.(tsx|ts|css)$/.test(name.name)) acc.push(p);
  }
  return acc;
}

let changed = 0;
for (const file of walk(ROOT)) {
  let s = fs.readFileSync(file, "utf8");
  const orig = s;
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to);
  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
  }
}
console.log(`Updated ${changed} files`);
