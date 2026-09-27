/**
 * Shared raw-color scan used by scripts/check-raw-colors.mjs and eslint-rules.
 * Hex / rgb / hsl literals are allowed only in src/styles/tokens.css.
 */
const fs = require("fs");
const path = require("path");

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
const TAILWIND_PALETTE =
  /\b(bg|text|border|ring|fill|stroke|from|via|to|divide|outline|shadow|decoration|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const ARBITRARY_COLOR = /\[(#|rgb|hsl)/;
const BRASS_UTILITY =
  /\b(bg|text|border|ring|fill|stroke|from|via|to|divide|outline|shadow|decoration|accent|caret)-brass(?:-[a-z0-9]+)?\b/;

const BRASS_ALLOW = new Set([
  "src/components/ui/button.tsx",
  "src/components/layout/sidebar.tsx",
  "src/components/layout/bottom-nav.tsx",
  "src/components/layout/floating-action-button.tsx",
]);

const EXEMPT = new Set(["src/styles/tokens.css"]);

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function isScannable(relPath) {
  if (EXEMPT.has(relPath)) return false;
  return /\.(tsx?|css)$/.test(relPath) && !relPath.endsWith(".d.ts");
}

function lineViolates(line, relPath) {
  if (COLOR_LITERAL.test(line) || ARBITRARY_COLOR.test(line)) return true;
  if (/\.(tsx?)$/.test(relPath) && TAILWIND_PALETTE.test(line)) return true;
  if (BRASS_UTILITY.test(line) && !BRASS_ALLOW.has(relPath)) return true;
  return false;
}

function violatingLines(text, relPath) {
  const counts = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!lineViolates(line, relPath)) continue;
    const key = line.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function scanSourceTree(root = repoRoot()) {
  const src = path.join(root, "src");
  const found = new Map();
  for (const abs of walk(src)) {
    const rel = toPosix(path.relative(root, abs));
    if (!isScannable(rel)) continue;
    const counts = violatingLines(fs.readFileSync(abs, "utf8"), rel);
    if (counts.size) found.set(rel, counts);
  }
  return found;
}

function baselinePath(root = repoRoot()) {
  return path.join(root, "scripts", "raw-color-baseline.json");
}

function enforcedPath(root = repoRoot()) {
  return path.join(root, "scripts", "raw-color-enforced.txt");
}

function loadBaseline(root = repoRoot()) {
  const file = baselinePath(root);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadEnforced(root = repoRoot()) {
  const file = enforcedPath(root);
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  );
}

function countsToObject(counts) {
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function serializeBaseline(found) {
  const files = {};
  for (const rel of [...found.keys()].sort()) {
    files[rel] = countsToObject(found.get(rel));
  }
  return files;
}

function diffViolations(current, baseline) {
  const errors = [];
  const warnings = [];
  const stale = [];
  const enforced = loadEnforced();
  const files = new Set([...current.keys(), ...Object.keys(baseline)]);

  for (const rel of files) {
    const now = current.get(rel) || new Map();
    const before = baseline[rel] || {};
    const lines = new Set([...now.keys(), ...Object.keys(before)]);
    for (const line of lines) {
      const nextCount = now.get(line) || 0;
      const prevCount = before[line] || 0;
      if (nextCount > prevCount) {
        const item = { file: rel, line, count: nextCount - prevCount };
        if (enforced.has(rel)) errors.push(item);
        else warnings.push(item);
      } else if (prevCount > nextCount) {
        stale.push({ file: rel, line, count: prevCount - nextCount });
      }
    }
  }

  return { errors, warnings, stale };
}

module.exports = {
  ARBITRARY_COLOR,
  BRASS_ALLOW,
  BRASS_UTILITY,
  COLOR_LITERAL,
  TAILWIND_PALETTE,
  baselinePath,
  diffViolations,
  lineViolates,
  loadBaseline,
  loadEnforced,
  repoRoot,
  scanSourceTree,
  serializeBaseline,
  toPosix,
  violatingLines,
};
