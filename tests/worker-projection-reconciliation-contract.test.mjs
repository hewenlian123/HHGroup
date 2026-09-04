import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

function source(path) {
  return readFileSync(path, "utf8");
}

function reconciliationMigration() {
  const filenames = readdirSync(MIGRATIONS).filter((name) =>
    /^\d{14}_reconcile_obsolete_worker_projection_function\.sql$/.test(name)
  );
  assert.equal(filenames.length, 1, "exactly one forward reconciliation migration is required");
  return source(resolve(MIGRATIONS, filenames[0]));
}

test("drops only the obsolete trigger and exact zero-argument function signature", () => {
  const sql = reconciliationMigration();

  assert.match(
    sql,
    /drop\s+trigger\s+if\s+exists\s+sync_worker_to_labor_workers_trigger\s+on\s+public\.workers\s*;/i
  );
  assert.match(
    sql,
    /drop\s+function\s+if\s+exists\s+public\.sync_worker_to_labor_workers\(\s*\)\s*;/i
  );
  assert.doesNotMatch(sql, /\bcascade\b/i);
  assert.doesNotMatch(sql, /\bcreate\s+(or\s+replace\s+)?function\b/i);
  assert.doesNotMatch(sql, /\b(grant|revoke|alter\s+policy|create\s+policy)\b/i);
});

test("application runtime has no dependency on the obsolete function or trigger", () => {
  const runtimeRoots = [resolve(ROOT, "src")];
  const obsoleteName = /\bsync_worker_to_labor_workers(?:_trigger)?\b/;

  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        assert.doesNotMatch(source(path), obsoleteName, `${path} must not call the obsolete path`);
      }
    }
  }

  for (const directory of runtimeRoots) scan(directory);
});
