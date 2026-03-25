#!/usr/bin/env node
/**
 * Compare columns inferred from supabase migration SQL vs src TypeScript.
 * Heuristic: not 100% accurate (dynamic selects, RPCs, views) but catches most gaps.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SRC = join(ROOT, "src");

/** @type {Map<string, Set<string>>} */
const migrationCols = new Map();

function addCol(table, col) {
  if (!table || !col) return;
  const t = table.toLowerCase();
  const c = col.toLowerCase();
  if (!migrationCols.has(t)) migrationCols.set(t, new Set());
  migrationCols.get(t).add(c);
}

// ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] name
const addColRe =
  /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?["']?(\w+)["']?\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+["']?(\w+)["']?/gi;

function parseCreateTable(sql) {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?(\w+)["']?\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1];
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < sql.length && depth > 0; i++) {
      const ch = sql[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    if (depth !== 0) continue;
    const body = sql.slice(start, i - 1);
    parseTableBodyColumns(table, body);
  }
}

function parseTableBodyColumns(table, body) {
  const lines = body.split(/\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("--")) continue;
    if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE|INDEX)\b/i.test(t)) continue;
    // "col" type  or  col type
    const mq = /^"([^"]+)"\s+\S/.exec(t);
    if (mq) {
      addCol(table, mq[1]);
      continue;
    }
    const mu = /^([a-z_][a-z0-9_]*)\s+\S/i.exec(t);
    if (mu) addCol(table, mu[1]);
  }
}

function loadMigrations() {
  const files = readdirSync(MIGRATIONS).filter(
    (f) => extname(f) === ".sql" && !f.startsWith("RUN_")
  );
  for (const f of files.sort()) {
    const p = join(MIGRATIONS, f);
    let sql = readFileSync(p, "utf8");
    // strip block comments /* */
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
    parseCreateTable(sql);
    let m;
    addColRe.lastIndex = 0;
    while ((m = addColRe.exec(sql)) !== null) {
      addCol(m[1], m[2]);
    }
  }
}

/** @type {Map<string, Set<string>>} */
const codeCols = new Map();

function addCodeCol(table, col) {
  if (!table || !col) return;
  const bad = new Set(["*", "count", "exact", "planned", "estimated", "head", "true", "false"]);
  const c = col.replace(/^["']|["']$/g, "").trim();
  if (!c || bad.has(c.toLowerCase()) || /[^\w]/.test(c)) return;
  const t = table.toLowerCase();
  if (!codeCols.has(t)) codeCols.set(t, new Set());
  codeCols.get(t).add(c.toLowerCase());
}

/** Split PostgREST select list; skips nested relation(...) embeds (their columns are not on .from table). */
function splitSelectList(s) {
  const out = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out
    .map((x) => {
      // PostgREST embed: columns inside parens belong to the joined table, not .from() table
      const rel = /^(\w+)\s*\(([^)]*)\)\s*$/i.exec(x);
      if (rel) {
        return [];
      }
      // alias:col or col
      const bare = x.split(":").pop().trim().split(/\s+/)[0];
      return bare.replace(/^"|"$/g, "");
    })
    .flat();
}

function walkDir(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkDir(p, acc);
    else if (/\.(tsx?)$/.test(name)) acc.push(p);
  }
}

/**
 * After .from("t"), find next .select('...') or .select(`...`) before another .from(
 */
function extractSelectsAfterFrom(text) {
  /** @type {{ table: string; selectList: string }[]} */
  const pairs = [];
  const fromRe = /\.from\(\s*["'](\w+)["']\s*\)/g;
  let fm;
  while ((fm = fromRe.exec(text)) !== null) {
    const table = fm[1];
    const start = fromRe.lastIndex;
    const rest = text.slice(start);
    const nextFrom = rest.search(/\.from\(\s*["']/);
    const chunk = nextFrom === -1 ? rest : rest.slice(0, nextFrom);
    const selStr = /(?:^|[^.\w])\.select\(\s*["']([^"']+)["']\s*\)/.exec(chunk);
    const selTpl = /(?:^|[^.\w])\.select\(\s*`([^`]+)`\s*\)/.exec(chunk);
    const sel = selStr?.[1] ?? selTpl?.[1];
    if (sel) pairs.push({ table, selectList: sel });
  }
  return pairs;
}

function extractInsertUpdateTables(text) {
  /** @type {{ table: string; keys: string[] }[]} */
  const out = [];
  const insRe =
    /\.from\(\s*["'](\w+)["']\s*\)[\s\n]*\.(?:insert|upsert)\(\s*\{([\s\S]*?)\}\s*(?:,|\))/g;
  let m;
  while ((m = insRe.exec(text)) !== null) {
    const keys = [];
    const objKeyRe = /["']([a-z][a-z0-9_]*)["']\s*:/g;
    let km;
    while ((km = objKeyRe.exec(m[2])) !== null) keys.push(km[1]);
    out.push({ table: m[1], keys });
  }
  const updRe = /\.from\(\s*["'](\w+)["']\s*\)[\s\n]*\.update\(\s*\{([\s\S]*?)\}\s*\)/g;
  while ((m = updRe.exec(text)) !== null) {
    const keys = [];
    const objKeyRe = /["']([a-z][a-z0-9_]*)["']\s*:/g;
    let km;
    while ((km = objKeyRe.exec(m[2])) !== null) keys.push(km[1]);
    out.push({ table: m[1], keys });
  }
  return out;
}

function loadCode() {
  const files = [];
  walkDir(SRC, files);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const { table, selectList } of extractSelectsAfterFrom(text)) {
      for (const part of splitSelectList(selectList)) {
        addCodeCol(table, part);
      }
    }
    for (const { table, keys } of extractInsertUpdateTables(text)) {
      for (const k of keys) addCodeCol(table, k);
    }
  }
}

loadMigrations();
loadCode();

const missing = [];
for (const [table, cols] of codeCols) {
  const mig = migrationCols.get(table);
  if (!mig) {
    // table might be view/RPC-only — skip tables never created in migrations
    continue;
  }
  for (const c of cols) {
    if (!mig.has(c)) missing.push({ table, column: c });
  }
}

missing.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column));

console.log(JSON.stringify({ missingCount: missing.length, missing }, null, 2));
