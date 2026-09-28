import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const ROLLBACKS = resolve(ROOT, "supabase/rollbacks");

function source(path) {
  assert.ok(existsSync(path), `${path} must exist`);
  return readFileSync(path, "utf8");
}

function closureMigration() {
  const filenames = readdirSync(MIGRATIONS).filter((name) =>
    /^\d{14}_financial_delete_authority_closure\.sql$/.test(name)
  );
  assert.equal(filenames.length, 1, "exactly one delete-authority closure migration is required");
  const filename = filenames[0];
  return { filename, sql: source(resolve(MIGRATIONS, filename)) };
}

test("removes every Data API direct-delete and replay-ledger write capability", () => {
  const { sql } = closureMigration();

  assert.match(
    sql,
    /revoke\s+delete\s+on\s+table\s+public\.worker_payments,\s*public\.ap_bills\s+from\s+authenticated,\s*service_role/i
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.worker_payment_reversals,\s*public\.ap_bill_deletions\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i
  );
  assert.match(sql, /tablename\s*=\s*any\(array\['worker_payments',\s*'ap_bills'\]\)/i);
  assert.match(sql, /cmd\s*=\s*any\(array\['DELETE',\s*'ALL'\]\)/i);
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+worker_payment_reversals_owner_admin/i);
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+ap_bill_deletions_owner_admin/i);
  assert.match(
    sql,
    /financial_delete_authority_predecessor_worker_policy_count\(\)[\s\S]*?select\s+%s::integer/i
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.financial_delete_authority_predecessor_worker_policy_count\(\)[\s\S]*?from\s+public,\s*anon,\s*authenticated,\s*service_role/i
  );
});

test("exposes only JWT-authorized SECURITY DEFINER atomic delete RPCs", () => {
  const { sql } = closureMigration();

  for (const functionName of ["reverse_worker_payment_atomic", "delete_ap_bill_draft_atomic"]) {
    assert.match(
      sql,
      new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns\\s+jsonb[\\s\\S]*?security\\s+definer[\\s\\S]*?set\\s+search_path\\s*=\\s*''`,
        "i"
      )
    );
  }
  assert.match(sql, /\(select\s+auth\.jwt\(\)\)->>'role'\s*,\s*''\)\s*<>\s*'service_role'/i);
  assert.match(sql, /\(select\s+auth\.jwt\(\)\)->'app_metadata'->>'role'/i);
  assert.doesNotMatch(sql, /current_user\s+not\s+in/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.reverse_worker_payment_atomic\(uuid, text\)[\s\S]*?grant\s+execute[\s\S]*?to\s+authenticated,\s*service_role/i
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.delete_ap_bill_draft_atomic\(uuid, text\)[\s\S]*?grant\s+execute[\s\S]*?to\s+authenticated,\s*service_role/i
  );
});

test("ships a confirmation-guarded non-anonymous rollback probe", () => {
  const { filename } = closureMigration();
  const rollback = source(resolve(ROLLBACKS, filename.replace(/\.sql$/, ".rollback.sql")));

  assert.match(rollback, /hh\.rollback_confirmation/i);
  assert.match(rollback, /ROLLBACK_FINANCIAL_DELETE_AUTHORITY_CLOSURE_\d{14}/);
  assert.match(rollback, /must\s+not\s+restore\s+anonymous\s+CRUD/i);
  assert.doesNotMatch(rollback, /grant\s+[^;]*(select|insert|update|delete)[^;]*to\s+anon/i);
  assert.match(
    rollback,
    /financial_delete_authority_predecessor_worker_policy_count\(\)\s*=\s*4[\s\S]*?create policy "allow authenticated delete"/i
  );
  assert.match(
    rollback,
    /create\s+or\s+replace\s+function\s+public\.reverse_worker_payment_atomic[\s\S]*?security\s+invoker[\s\S]*?current_user\s+not\s+in\s*\('postgres',\s*'service_role'\)/i
  );
  assert.match(
    rollback,
    /create\s+or\s+replace\s+function\s+public\.delete_ap_bill_draft_atomic[\s\S]*?security\s+invoker[\s\S]*?current_user\s+not\s+in\s*\('postgres',\s*'service_role'\)/i
  );
  assert.match(
    rollback,
    /drop\s+function\s+public\.financial_delete_authority_predecessor_worker_policy_count\(\)/i
  );
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});
