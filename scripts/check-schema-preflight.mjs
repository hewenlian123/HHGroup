#!/usr/bin/env node
/**
 * Schema preflight: catch drift before deploy.
 *
 * Checks:
 * 1) Every migration filename referenced in code HINT strings exists.
 * 2) Every `.from("table")` reference points to a table created in migrations (best-effort).
 * 3) Required sync primitives exist for known mirror tables (labor_workers ← workers).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(root, "src");
const migrationsDir = join(root, "supabase", "migrations");
const configPath = join(root, "scripts", "schema-preflight.config.json");

function listFilesRecursive(dir, exts) {
  const out = [];
  const items = readdirSync(dir);
  for (const name of items) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFilesRecursive(full, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const migrationSet = new Set(migrationFiles);

const sqlText = migrationFiles.map((f) => readFileSync(join(migrationsDir, f), "utf8")).join("\n");

function readConfig() {
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    const criticalTables = Array.isArray(parsed?.criticalTables)
      ? parsed.criticalTables
          .map((x) => (typeof x?.table === "string" ? String(x.table).trim() : ""))
          .filter(Boolean)
      : [];
    const rlsMode = String(parsed?.rlsMode ?? "loose").toLowerCase();
    return {
      rlsMode: ["loose", "strict", "both"].includes(rlsMode) ? rlsMode : "loose",
      criticalTables,
    };
  } catch {
    return { rlsMode: "loose", criticalTables: [] };
  }
}

function hasDbObject(table) {
  const re = new RegExp(
    String.raw`create\s+table\s+if\s+not\s+exists\s+public\.${table}\b|create\s+table\s+public\.${table}\b|create\s+(or\s+replace\s+)?view\s+public\.${table}\b|create\s+materialized\s+view\s+public\.${table}\b`,
    "i"
  );
  return re.test(sqlText);
}

function hasRlsEnabled(table) {
  const re = new RegExp(
    String.raw`alter\s+table\s+public\.${table}\s+enable\s+row\s+level\s+security`,
    "i"
  );
  return re.test(sqlText);
}

function hasSelectPolicy(table) {
  // Accept any of:
  // - create policy ... on public.table for select ...
  // - create policy ... on public.table ... (no "for select" implies ALL)
  // - create policy ... on public.table for select to authenticated/anon ...
  const re = new RegExp(
    String.raw`create\s+policy[\s\S]{0,300}on\s+public\.${table}\b[\s\S]{0,300}(for\s+select\b|for\s+all\b|using\s*\()`,
    "i"
  );
  return re.test(sqlText);
}

function hasSelectPolicyForRole(table, role) {
  const re = new RegExp(
    String.raw`create\s+policy[\s\S]{0,300}on\s+public\.${table}\b[\s\S]{0,300}(for\s+select\b|for\s+all\b)[\s\S]{0,300}\bto\s+${role}\b`,
    "i"
  );
  return re.test(sqlText);
}

function main() {
  const cfg = readConfig();
  const modeFromEnv = String(process.env.SCHEMA_PREFLIGHT_RLS_MODE ?? "").toLowerCase();
  const rlsMode = ["loose", "strict", "both"].includes(modeFromEnv) ? modeFromEnv : cfg.rlsMode;

  const tsFiles = listFilesRecursive(srcDir, [".ts", ".tsx"]);
  const hintMigrations = new Set();
  const fromTables = new Set();
  const riskySwallowedSelfHeal = [];

  const hintRe = /supabase\/migrations\/(\d{12,14}_[a-z0-9_]+\.sql)/gi;
  const fromAnyRe = /\.from\(\s*["']([a-z_]+)["']\s*\)/g;

  for (const f of tsFiles) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(hintRe)) hintMigrations.add(m[1]);
    for (const m of s.matchAll(fromAnyRe)) {
      const table = m[1];
      const idx = m.index ?? 0;
      // Ignore storage buckets: `supabase.storage.from("bucket")` often breaks across lines.
      const prefix = s.slice(Math.max(0, idx - 80), idx);
      if (/storage\s*$/i.test(prefix)) continue;
      fromTables.add(table);
    }

    // Best-effort: detect "self-heal upsert/insert" blocks that swallow errors without a missing-table guard.
    // These often hide RLS / column drift issues until a downstream FK fails.
    if (f.includes(`${join("src", "lib")}`)) {
      const hasUpsertOrInsert = /\.upsert\(|\.insert\(/.test(s);
      const hasEmptyCatch =
        /catch\s*\(\s*[^)]*\s*\)\s*\{\s*\}/.test(s) || /catch\s*\{\s*\}/.test(s);
      const hasSwallowComment =
        /catch\s*(\([^)]*\))?\s*\{[\s\S]*?(ignore|no-op|noop)[\s\S]*?\}/i.test(s);
      const hasMissingTableGuard =
        /schema cache|relation.*does not exist|could not find the table/i.test(s);
      if (hasUpsertOrInsert && (hasEmptyCatch || hasSwallowComment) && !hasMissingTableGuard) {
        riskySwallowedSelfHeal.push(f);
      }
    }
  }

  const errors = [];

  // 1) referenced migration files exist
  for (const m of hintMigrations) {
    if (!migrationSet.has(m)) errors.push(`Missing migration referenced by HINT: ${m}`);
  }

  // 2) referenced tables exist in migrations (best-effort; allowlist known non-table targets)
  const allow = new Set(["schema_migrations"]);
  for (const t of fromTables) {
    if (allow.has(t)) continue;
    if (!hasDbObject(t)) {
      // Some tables are created by remote_schema snapshots or SQL Editor scripts; still warn.
      errors.push(`Table referenced in code not found in migrations (create table missing?): ${t}`);
    }
  }

  // 3) known mirror: labor_workers sync exists somewhere in migrations
  const hasLaborWorkers = hasDbObject("labor_workers");
  const hasLaborWorkersBackfill = /insert\s+into\s+public\.labor_workers\s*\(/i.test(sqlText);
  if (!hasLaborWorkers || !hasLaborWorkersBackfill) {
    errors.push(
      "labor_workers sync not detected in migrations (expected create table + insert from workers)."
    );
  }

  // 3b) key module tables should have RLS + readable policy (authenticated or anon)
  const criticalTables = cfg.criticalTables;

  for (const t of criticalTables) {
    if (!hasDbObject(t)) continue; // don't block if feature/table not present in this repo snapshot
    if (!hasRlsEnabled(t)) {
      errors.push(`RLS not enabled in migrations for critical table: ${t}`);
      continue;
    }
    if (!hasSelectPolicy(t)) {
      errors.push(`No readable policy detected in migrations for critical table: ${t}`);
      continue;
    }
    // Prefer explicit role policies, but accept policies without `to` clause as "public".
    const hasAuth = hasSelectPolicyForRole(t, "authenticated");
    const hasAnon = hasSelectPolicyForRole(t, "anon");
    if (rlsMode === "strict" && !hasAuth) {
      errors.push(`Strict RLS mode: ${t} must have readable policy for role authenticated.`);
    }
    if (rlsMode === "both" && (!hasAuth || !hasAnon)) {
      errors.push(
        `Both-role RLS mode: ${t} must have readable policies for authenticated and anon.`
      );
    }
    if (
      rlsMode === "loose" &&
      !hasAuth &&
      !hasAnon &&
      /create\s+policy[\s\S]{0,300}\bto\b/i.test(sqlText)
    ) {
      // Repo uses explicit roles in policies, but this table has no explicit readable role policy.
      errors.push(
        `Readable policy found for ${t}, but no explicit 'to authenticated/anon' detected.`
      );
    }
  }

  // 4) self-heal blocks should not swallow non-missing-table errors
  if (riskySwallowedSelfHeal.length > 0) {
    errors.push(
      `Potential swallowed self-heal errors in src/lib (missing-table guard not detected):\n` +
        riskySwallowedSelfHeal.map((p) => `  - ${p.replace(root + "/", "")}`).join("\n")
    );
  }

  if (errors.length > 0) {
    console.error("Schema preflight failed:");
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }

  console.log(`Schema preflight passed (RLS mode: ${rlsMode}).`);
}

main();
