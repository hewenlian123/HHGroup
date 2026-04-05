#!/usr/bin/env node
/**
 * ONE-TIME migration (already applied). Do not re-run: naive `>` parsing breaks `() =>` in JSX.
 *
 * Migrates Button variant="ghost" → outline + btn-outline-ghost,
 * variant="destructive" → outline + btn-outline-destructive (merged into className).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src");
const GHOST = "btn-outline-ghost";
const DESTR = "btn-outline-destructive";

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".next") continue;
      walk(p, acc);
    } else if (name.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

/** Insert token after className=" or className={cn( */
function mergeClassNameProp(props, token) {
  // className="foo" -> className="token foo"
  let m = props.match(/className="([^"]*)"/);
  if (m) {
    const inner = m[1].trim();
    const next = inner ? `${token} ${inner}` : token;
    return props.replace(/className="[^"]*"/, `className="${next}"`);
  }
  // className={cn("a", "b")} or className={cn("a")}
  m = props.match(/className=\{\s*cn\s*\(\s*["']([^"']*)["']/);
  if (m) {
    const first = m[1].trim();
    const next = first ? `${token} ${first}` : token;
    return props.replace(/className=\{\s*cn\s*\(\s*["'][^"']*["']/, `className={cn("${next}"`);
  }
  // className={cn( without leading string - rare
  m = props.match(/className=\{\s*cn\s*\(\s*/);
  if (m) {
    return props.replace(/className=\{\s*cn\s*\(\s*/, `className={cn("${token}", `);
  }
  // no className
  const trimmed = props.trimEnd();
  if (!trimmed) return ` className="${token}"`;
  return `${trimmed} className="${token}"`;
}

function migrateButtonTag(openTag) {
  // openTag includes <Button ...> or <Button .../> — may span lines
  let t = openTag;
  if (!/variant="ghost"/.test(t) && !/variant="destructive"/.test(t)) return openTag;

  const isGhost = /variant="ghost"/.test(t);
  const isDestr = /variant="destructive"/.test(t);
  const token = isGhost ? GHOST : DESTR;

  t = t.replace(/variant="ghost"/, 'variant="outline"');
  t = t.replace(/variant="destructive"/, 'variant="outline"');

  const inner = t.replace(/^<Button\s*/, "").replace(/\s*\/?>$/, "");
  const merged = mergeClassNameProp(inner, token);
  const selfClosing = /\/>\s*$/.test(openTag);
  return `<Button ${merged.trim()}${selfClosing ? " />" : ">"}`;
}

function processFile(content) {
  let out = "";
  let i = 0;
  while (i < content.length) {
    const idx = content.indexOf("<Button", i);
    if (idx === -1) {
      out += content.slice(i);
      break;
    }
    out += content.slice(i, idx);
    let j = idx + 6;
    let depth = 1;
    let inQuote = null;
    let escape = false;
    while (j < content.length && depth > 0) {
      const c = content[j];
      if (inQuote) {
        if (escape) {
          escape = false;
        } else if (c === "\\") {
          escape = true;
        } else if (c === inQuote) {
          inQuote = null;
        }
        j++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inQuote = c;
        j++;
        continue;
      }
      if (c === "<") depth++;
      if (c === ">") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
      j++;
    }
    const tag = content.slice(idx, j);
    out += migrateButtonTag(tag);
    i = j;
  }
  return out;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const raw = fs.readFileSync(file, "utf8");
  if (!/variant="ghost"|variant="destructive"/.test(raw)) continue;
  const next = processFile(raw);
  if (next !== raw) {
    fs.writeFileSync(file, next);
    changed++;
  }
}
console.log(`Migrated ${changed} files`);
