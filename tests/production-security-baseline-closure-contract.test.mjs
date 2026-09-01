import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const ROLLBACKS = resolve(ROOT, "supabase/rollbacks");
const RELEASE_DIR = resolve(ROOT, "docs/security-releases/2026-08-12-production-security-baseline");

function source(path) {
  assert.ok(existsSync(path), `${path} must exist`);
  return readFileSync(path, "utf8");
}

function securityMigration() {
  const filenames = readdirSync(MIGRATIONS).filter((name) =>
    /^\d{14}_production_security_baseline_closure\.sql$/.test(name)
  );
  assert.equal(filenames.length, 1, "exactly one security baseline migration is required");
  const filename = filenames[0];
  return { filename, sql: source(resolve(MIGRATIONS, filename)) };
}

test("removes anonymous CRUD without deleting the two retained historical tables", () => {
  const { sql } = securityMigration();

  for (const table of ["audit_logs", "tmp_backup_worker_advances_haijun"]) {
    assert.match(
      sql,
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s+anon,\\s+authenticated,\\s+service_role`,
        "i"
      )
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`drop\\s+table\\s+(if\\s+exists\\s+)?public\\.${table}`, "i")
    );
    assert.doesNotMatch(sql, new RegExp(`delete\\s+from\\s+public\\.${table}`, "i"));
  }
});

test("enforces the owner/admin Data API contract and guarded service-role projection writes", () => {
  const { sql } = securityMigration();

  assert.match(
    sql,
    /revoke\s+all\s+privileges\s+on\s+table\s+public\.labor_workers\s+from\s+public,\s+anon,\s+authenticated,\s+service_role/i
  );
  assert.match(sql, /grant\s+select\s+on\s+table\s+public\.labor_workers\s+to\s+authenticated/i);
  assert.match(
    sql,
    /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.labor_workers\s+to\s+service_role/i
  );
  assert.match(sql, /pg_get_functiondef\('public\.is_owner_or_admin\(\)'::regprocedure\)/i);
  assert.match(sql, /rolname\s*=\s*'service_role'[\s\S]*?rolbypassrls/i);
  assert.match(sql, /has_function_privilege\([\s\S]*?'authenticated'[\s\S]*?'EXECUTE'/i);
  assert.match(sql, /indisunique[\s\S]*?indisvalid[\s\S]*?indisready[\s\S]*?indimmediate/i);
  assert.match(
    sql,
    /create\s+trigger\s+hh_sync_worker_to_labor_workers_projection_trigger[\s\S]*?after\s+insert\s+or\s+update\s+of\s+name\s+on\s+public\.workers/i
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.hh_sync_worker_to_labor_workers_projection\(\)[\s\S]*?from\s+public,\s+anon,\s+authenticated,\s+service_role/i
  );
  assert.match(
    sql,
    /insert\s+into\s+public\.labor_workers\s*\(id, name\)\s*select\s+id, name\s*from\s+public\.workers/i
  );
  assert.doesNotMatch(
    sql,
    /grant\s+[^;]*(insert|update|delete)[^;]*on\s+table\s+public\.labor_workers\s+to\s+authenticated/i
  );
  for (const policy of [
    "dev full access",
    "allow authenticated delete",
    "allow authenticated insert",
    "allow authenticated read",
    "allow authenticated update",
  ]) {
    assert.ok(sql.includes(`drop policy if exists "${policy}" on public.labor_workers`));
  }
  assert.match(
    sql,
    /create\s+policy\s+labor_workers_owner_admin_select[\s\S]*?for\s+select[\s\S]*?to\s+authenticated[\s\S]*?using\s*\(\s*\(\s*select\s+public\.is_owner_or_admin\(\)\s*\)\s*\)/i
  );
  assert.doesNotMatch(sql, /to\s+anon\s+using\s*\(\s*true\s*\)/i);
});

test("keeps worker mutations behind the verified server-side client", () => {
  const workersRoute = source(resolve(ROOT, "src/app/api/labor/workers/route.ts"));
  const workerRoute = source(resolve(ROOT, "src/app/api/labor/workers/[id]/route.ts"));
  const workerEditPage = source(resolve(ROOT, "src/app/workers/[id]/edit/page.tsx"));
  const laborDb = source(resolve(ROOT, "src/lib/labor-db.ts"));
  const workersDb = source(resolve(ROOT, "src/lib/workers-db.ts"));
  const projection = source(resolve(ROOT, "src/lib/labor-workers-projection.ts"));
  const laborEntriesRoute = source(resolve(ROOT, "src/app/api/labor/entries/route.ts"));
  const workerBalanceRoute = source(
    resolve(ROOT, "src/app/api/labor/worker-balances/[workerId]/route.ts")
  );

  assert.match(
    workerRoute,
    /export\s+async\s+function\s+PATCH[\s\S]*?requireSupabaseOwnerOrAdmin\(req\)[\s\S]*?const\s+admin\s*=\s+getServerSupabaseAdmin\(\)[\s\S]*?updateWorker\(\s*id,\s*\{[\s\S]*?\},\s*admin\s*\)/
  );
  assert.match(
    workerRoute,
    /export\s+async\s+function\s+DELETE[\s\S]*?requireSupabaseOwnerOrAdmin\(req\)[\s\S]*?const\s+admin\s*=\s+getServerSupabaseAdmin\(\)[\s\S]*?deleteWorker\(id,\s*admin\)/
  );
  assert.match(
    laborDb,
    /export\s+async\s+function\s+updateWorker[\s\S]*?explicitClient\?:\s*SupabaseClient[\s\S]*?const\s+c\s*=\s*client\(explicitClient\)/
  );
  assert.match(
    laborDb,
    /export\s+async\s+function\s+deleteWorker\(id:\s*string,\s*explicitClient\?:\s*SupabaseClient\)[\s\S]*?const\s+c\s*=\s*client\(explicitClient\)/
  );
  assert.match(workerRoute, /getServerSupabaseAdmin\(\)/);
  assert.doesNotMatch(workerRoute, /getServerSupabaseInternal\(\)/);
  assert.match(
    workersRoute,
    /export\s+async\s+function\s+POST[\s\S]*?requireSupabaseOwnerOrAdmin\(req\)[\s\S]*?getServerSupabaseAdmin\(\)/
  );
  assert.match(workerRoute, /body\.notes\s*!==\s*undefined/);
  assert.match(workerRoute, /if\s*\(!deleted\)[\s\S]*?status:\s*409/);
  assert.doesNotMatch(workerEditPage, /from\s+["']@\/lib\/data["']/);
  assert.match(workerEditPage, /fetch\(`\/api\/labor\/workers\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(projection, /from\("labor_workers"\)[\s\S]*?upsert\(\{ id, name \}/);
  assert.match(laborDb, /syncLaborWorkerProjectionWithClient\(c, worker\)/);
  assert.doesNotMatch(laborDb, /from\("labor_workers"\)\.upsert/);
  assert.doesNotMatch(workersDb, /syncLaborWorkerProjectionWithClient/);
  assert.doesNotMatch(workersRoute, /syncLaborWorkerProjectionViaSql/);
  assert.match(
    laborEntriesRoute,
    /export\s+async\s+function\s+POST[\s\S]*?requireSupabaseOwnerOrAdmin\(request\)[\s\S]*?getServerSupabaseAdmin\(\)/
  );
  assert.doesNotMatch(laborEntriesRoute, /getServerSupabaseInternal\(/);
  assert.match(
    workerBalanceRoute,
    /export\s+async\s+function\s+DELETE[\s\S]*?requireSupabaseOwnerOrAdmin\(req\)[\s\S]*?getServerSupabaseAdminNoStore\(\)/
  );
});

test("does not server-render labor worker data through a service-role client for non-owners", () => {
  const protectedReaders = [
    "src/app/workers/page.tsx",
    "src/app/labor/monthly/page.tsx",
    "src/app/projects/[id]/labor/page.tsx",
    "src/app/projects/[id]/page.tsx",
    "src/app/projects/[id]/profit/page.tsx",
    "src/app/workers/[id]/statement/page.tsx",
    "src/app/workers/[id]/statement/print/page.tsx",
    "src/app/labor/payments/[id]/receipt/page.tsx",
    "src/app/receipt/print/[id]/page.tsx",
  ];

  for (const relativePath of protectedReaders) {
    const reader = source(resolve(ROOT, relativePath));
    assert.match(
      reader,
      /requireSupabaseOwnerOrAdminServerAction/,
      `${relativePath} must establish the strict owner/admin boundary before reading labor data`
    );
  }

  const schemaRepairRoute = source(resolve(ROOT, "src/app/api/ensure-schema/route.ts"));
  assert.match(
    schemaRepairRoute,
    /guardNonProductionOnlyRequest\(request\)[\s\S]*?requireSupabaseOwnerOrAdmin\(request\)[\s\S]*?await import\("@\/lib\/ensure-schema-auto-repair"\)/
  );

  const financialWorkflowRoute = source(
    resolve(ROOT, "src/app/api/test/financial-workflows/route.ts")
  );
  assert.match(
    financialWorkflowRoute,
    /guardNonProductionOnlyRequest\(req\)[\s\S]*?requireSupabaseOwnerOrAdmin\(req\)[\s\S]*?getServerSupabaseAdmin\(\)/
  );

  for (const relativePath of [
    "src/app/api/seed-workers/route.ts",
    "src/app/api/seed/operations/route.ts",
  ]) {
    const route = source(resolve(ROOT, relativePath));
    assert.match(
      route,
      /requireSupabaseOwnerOrAdmin\(request\)[\s\S]*?guardDangerousMaintenanceRequest\(request\)/,
      `${relativePath} must verify owner/admin authorization before worker mutations`
    );
    assert.match(route, /getServerSupabaseAdmin\(\)/);
  }

  const receiptPayload = source(resolve(ROOT, "src/lib/worker-payment-receipt-data.ts"));
  const receiptNo = source(resolve(ROOT, "src/lib/worker-payment-receipt-no.ts"));
  assert.doesNotMatch(receiptPayload, /getServerSupabase/);
  assert.doesNotMatch(receiptNo, /getServerSupabase/);
});

test("ships guarded rollback, read-only Production preflight, and an executable access matrix", () => {
  const { filename } = securityMigration();
  const version = filename.slice(0, 14);
  const rollback = source(
    resolve(ROLLBACKS, `${version}_production_security_baseline_closure.rollback.sql`)
  );
  const preflight = source(resolve(RELEASE_DIR, "production-preflight.sql"));
  const matrix = source(resolve(RELEASE_DIR, "access-matrix-verification.sql"));
  const releaseNotes = source(resolve(RELEASE_DIR, "README.md"));

  assert.match(rollback, /current_setting\('hh\.rollback_confirmation', true\)/i);
  assert.match(rollback, /raise exception/i);
  assert.match(
    rollback,
    /drop trigger if exists hh_sync_worker_to_labor_workers_projection_trigger/i
  );
  assert.match(
    rollback,
    /drop function if exists public\.hh_sync_worker_to_labor_workers_projection/i
  );
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
  assert.match(preflight, /information_schema\.columns/i);
  assert.match(preflight, /pg_policies/i);
  assert.match(preflight, /role_table_grants/i);
  assert.match(preflight, /pg_trigger/i);
  assert.match(preflight, /hh_sync_worker_to_labor_workers_projection/i);
  assert.match(preflight, /indisunique[\s\S]*?indisvalid[\s\S]*?indisready[\s\S]*?indimmediate/i);
  assert.match(preflight, /aclexplode\(coalesce\(p\.proacl/i);
  assert.match(preflight, /sync_worker_to_labor_workers_trigger/i);
  assert.match(matrix, /set local role anon/i);
  assert.match(matrix, /set local role authenticated/i);
  assert.match(matrix, /set local role service_role/i);
  assert.match(matrix, /rollback/i);
  assert.ok(releaseNotes.includes("Receipt Security: strengthened"));
  assert.ok(releaseNotes.includes("Financial correctness: unchanged in data and calculation"));
});
