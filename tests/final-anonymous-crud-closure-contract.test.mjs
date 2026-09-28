import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const ROLLBACKS = resolve(ROOT, "supabase/rollbacks");
const RELEASE_DIR = resolve(ROOT, "docs/security-releases/2026-08-13-final-anonymous-crud-closure");

function source(path) {
  assert.ok(existsSync(path), `${path} must exist`);
  return readFileSync(path, "utf8");
}

function closureMigration() {
  const filenames = readdirSync(MIGRATIONS).filter((name) =>
    /^\d{14}_final_anonymous_crud_closure\.sql$/.test(name)
  );
  assert.equal(filenames.length, 1, "exactly one anonymous CRUD closure migration is required");
  const filename = filenames[0];
  return { filename, sql: source(resolve(MIGRATIONS, filename)) };
}

test("removes direct anon and authenticated access to only the three scoped tables", () => {
  const { sql } = closureMigration();

  for (const table of ["cost_allocations", "material_selections", "material_selection_items"]) {
    assert.match(
      sql,
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s+anon,\\s+authenticated`,
        "i"
      )
    );
    assert.doesNotMatch(
      sql,
      new RegExp(
        `grant\\s+[^;]*\\bon\\s+table\\s+public\\.${table}\\s+to\\s+(?:anon|authenticated)`,
        "i"
      )
    );
    assert.doesNotMatch(
      sql,
      new RegExp(
        `create\\s+policy[\\s\\S]*?on\\s+public\\.${table}[\\s\\S]*?(?:using|with\\s+check)\\s*\\(\\s*true\\s*\\)`,
        "i"
      )
    );
  }

  assert.match(
    sql,
    /revoke\s+all\s+privileges\s+on\s+table\s+public\.cost_allocations\s+from\s+public,\s+anon,\s+authenticated,\s+service_role/i
  );
  for (const table of ["material_selections", "material_selection_items"]) {
    assert.match(
      sql,
      new RegExp(
        `grant\\s+select\\s*,\\s*insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+service_role`,
        "i"
      )
    );
  }
});

test("removes every known permissive policy and fails closed on unclassified policy drift", () => {
  const { sql } = closureMigration();

  for (const policy of [
    "allow authenticated delete",
    "allow authenticated insert",
    "allow authenticated read",
    "allow authenticated update",
    "cost_allocations_delete_all",
    "cost_allocations_insert_all",
    "cost_allocations_select_all",
    "cost_allocations_update_all",
    "material_selections_delete_all",
    "material_selections_insert_all",
    "material_selections_select_all",
    "material_selections_update_all",
    "material_selection_items_delete_all",
    "material_selection_items_insert_all",
    "material_selection_items_select_all",
    "material_selection_items_update_all",
  ]) {
    assert.match(sql, new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${policy}"`, "i"));
  }

  assert.match(sql, /from\s+pg_policies/i);
  assert.match(sql, /found unexpected scoped RLS policy/i);
  assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i);
});

test("removes material-selection application code and drops those tables", () => {
  for (const relativePath of [
    "src/lib/material-selection-sheets-db.ts",
    "src/app/materials/page.tsx",
    "src/app/api/materials/[id]/items/route.ts",
    "tests/material-selections.spec.ts",
  ]) {
    assert.equal(existsSync(resolve(ROOT, relativePath)), false, `${relativePath} is removed`);
  }

  const drop = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith("_drop_non_finance_project_features.sql"))
    .sort()
    .at(-1);
  assert.ok(drop, "drop migration exists");
  const sql = source(resolve(MIGRATIONS, drop));
  assert.match(sql, /drop table if exists public\.material_selections/i);
  assert.match(sql, /drop table if exists public\.material_selection_items/i);
  assert.match(sql, /drop table if exists public\.material_catalog/i);
});

test("ships a confirmation-guarded rollback, read-only production preflight, and executable access matrix", () => {
  const { filename } = closureMigration();
  const version = filename.slice(0, 14);
  const rollback = source(
    resolve(ROLLBACKS, `${version}_final_anonymous_crud_closure.rollback.sql`)
  );
  const preflight = source(resolve(RELEASE_DIR, "production-preflight.sql"));
  const matrix = source(resolve(RELEASE_DIR, "access-matrix-verification.sql"));
  const releaseNotes = source(resolve(RELEASE_DIR, "README.md"));

  assert.match(rollback, /current_setting\('hh\.rollback_confirmation', true\)/i);
  assert.match(rollback, /raise exception/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
  assert.match(preflight, /information_schema\.columns/i);
  assert.match(preflight, /pg_policies/i);
  assert.match(preflight, /aclexplode/i);
  assert.match(
    preflight,
    /pg_get_userbyid\(acl\.grantee\) in \('anon', 'authenticated', 'service_role'\)/i
  );
  assert.match(matrix, /set local role anon/i);
  assert.match(matrix, /set local role authenticated/i);
  assert.match(matrix, /set local role service_role/i);
  assert.match(matrix, /rollback/i);
  assert.match(releaseNotes, /server-mediated/i);
  assert.match(releaseNotes, /Receipt Security: unchanged/i);
  assert.match(releaseNotes, /Financial correctness: unchanged/i);
});
