#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDirectory = `${root}/supabase/migrations`;
const localDatabaseUrl =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(localDatabaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

if (!localHosts.has(parsedDatabaseUrl.hostname) || parsedDatabaseUrl.port !== "54322") {
  throw new Error(
    "Canonical Closeout checks are restricted to local Docker Supabase on port 54322."
  );
}

const PROJECT_ID = "d1000000-0000-4000-8000-000000000001";
const RAW_SHA256 = "d97cdd6462f56b4f6a2b6aa835cea573392627ccb07ae1147ca0f1a35a87b349";
const NORMALIZED_SHA256 = "474e4070650e5be94320811d0bf9bbb6f10f3cb7630d3630bba60d9254a41bbe";
const PRECHECK_PROJECT_ID = "d2000000-0000-4000-8000-000000000001";

const sql = postgres(localDatabaseUrl, { max: 4, onnotice: () => {} });

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}

async function expectDatabaseFailure(operation, message) {
  let failed = false;
  try {
    await operation();
  } catch {
    failed = true;
  }
  invariant(failed, message);
}

async function serviceReplace(items, notes = null) {
  return sql.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    const [result] = await tx`
      select public.replace_final_punch_list(
        ${PROJECT_ID}::uuid,
        '2026-08-02'::date,
        'Local verification',
        ${notes},
        null,
        null,
        ${sql.json(items)}::jsonb
      ) as id
    `;
    return result.id;
  });
}

async function orderedItems() {
  return sql`
    select i.item, i.status, i.position
    from public.final_punch_list_items i
    join public.final_punch_lists p on p.id = i.punch_list_id
    where p.project_id = ${PROJECT_ID}::uuid
    order by i.position, i.id
  `;
}

async function preparePreReconciliationBaseline(tx, historicLegacySql) {
  await tx.unsafe(`
    drop function if exists public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb);

    drop policy if exists "closeout projects.update read" on public.final_punch_lists;
    drop policy if exists "closeout projects.update read" on public.final_punch_list_items;
    drop policy if exists "closeout projects.update read" on public.warranties;
    drop policy if exists "closeout projects.update read" on public.completion_certificates;

    alter table public.final_punch_lists
      drop constraint if exists final_punch_lists_project_id_key,
      alter column project_id drop not null;
    alter table public.warranties
      drop constraint if exists warranties_project_id_key,
      alter column project_id drop not null;
    alter table public.completion_certificates
      drop constraint if exists completion_certificates_project_id_key,
      alter column project_id drop not null;
    alter table public.final_punch_list_items
      drop constraint if exists final_punch_list_items_position_check,
      drop constraint if exists final_punch_list_items_status_check,
      drop constraint if exists final_punch_list_items_punch_list_position_key,
      alter column punch_list_id drop not null,
      alter column status drop not null,
      drop column if exists position;

    grant all privileges on table public.final_punch_lists to anon, authenticated, service_role;
    grant all privileges on table public.final_punch_list_items to anon, authenticated, service_role;
    grant all privileges on table public.warranties to anon, authenticated, service_role;
    grant all privileges on table public.completion_certificates to anon, authenticated, service_role;
  `);

  for (const table of [
    "final_punch_lists",
    "final_punch_list_items",
    "warranties",
    "completion_certificates",
  ]) {
    await tx.unsafe(`
      create policy "allow authenticated read" on public.${table}
        for select to authenticated using (true);
      create policy "allow authenticated insert" on public.${table}
        for insert to authenticated with check (true);
      create policy "allow authenticated update" on public.${table}
        for update to authenticated using (true);
      create policy "allow authenticated delete" on public.${table}
        for delete to authenticated using (true);
    `);
  }

  await tx.unsafe(historicLegacySql);
}

async function expectMigrationPreflightFailure({ label, migrationBody, historicLegacySql, setup }) {
  let expectedFailure = false;
  let setupComplete = false;
  try {
    await sql.begin(async (tx) => {
      await preparePreReconciliationBaseline(tx, historicLegacySql);
      await setup(tx);
      setupComplete = true;
      await tx.unsafe(migrationBody);
      throw new Error("CANONICAL_MIGRATION_UNEXPECTEDLY_SUCCEEDED");
    });
  } catch (error) {
    expectedFailure =
      error instanceof Error && error.message !== "CANONICAL_MIGRATION_UNEXPECTEDLY_SUCCEEDED";
  }
  invariant(setupComplete, `${label} fixture setup failed before migration preflight.`);
  invariant(expectedFailure, `${label} did not fail closed.`);
}

async function verifyCompatibilityMatrix(historicLegacySql) {
  await expectDatabaseFailure(
    () => sql.unsafe("select * from public.project_closeout_punch limit 1"),
    "A/B legacy Closeout query unexpectedly works against canonical database D."
  );

  let probeComplete = false;
  try {
    await sql.begin(async (tx) => {
      await preparePreReconciliationBaseline(tx, historicLegacySql);
      await tx`insert into public.projects (id, name) values (${PRECHECK_PROJECT_ID}::uuid, '[Local] Compatibility')`;
      const [legacyPunch] = await tx`
        insert into public.project_closeout_punch (project_id, items)
        values (
          ${PRECHECK_PROJECT_ID}::uuid,
          ${tx.json([{ item: "Legacy app path", status: "pending" }])}::jsonb
        )
        on conflict (project_id) do update set items = excluded.items
        returning project_id, items
      `;
      invariant(
        legacyPunch.project_id === PRECHECK_PROJECT_ID && legacyPunch.items.length === 1,
        "A/B legacy caller fixture did not execute against database E."
      );
      const [canonicalAvailability] = await tx`
        select
          to_regprocedure(
            'public.replace_final_punch_list(uuid,date,text,text,text,text,jsonb)'
          ) is not null as rpc_exists,
          exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = 'final_punch_list_items'
              and column_name = 'position'
          ) as position_exists
      `;
      invariant(
        !canonicalAvailability.rpc_exists && !canonicalAvailability.position_exists,
        "C application was not blocked by missing canonical database E contract."
      );
      probeComplete = true;
      throw new Error("COMPATIBILITY_MATRIX_PROBE_COMPLETE");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "COMPATIBILITY_MATRIX_PROBE_COMPLETE") {
      throw error;
    }
  }
  invariant(probeComplete, "Compatibility matrix transaction did not complete.");
}

try {
  const files = await readdir(migrationsDirectory);
  const provenanceName = "20260801065640_restore_estimate_grants_rls_parity.sql";
  invariant(files.includes(provenanceName), "Production provenance migration is missing.");
  invariant(
    !files.includes("20260731080335_restore_estimate_grants_rls_parity.sql"),
    "Sibling provenance migration must be absent."
  );
  const provenanceBytes = await readFile(`${migrationsDirectory}/${provenanceName}`);
  invariant(sha256(provenanceBytes) === RAW_SHA256, "Provenance raw fingerprint changed.");
  invariant(
    sha256(normalizeSql(provenanceBytes.toString("utf8"))) === NORMALIZED_SHA256,
    "Provenance normalized fingerprint changed."
  );
  const canonicalMigrationName = files.find((file) =>
    file.endsWith("_canonical_closeout_reconciliation.sql")
  );
  invariant(canonicalMigrationName, "Canonical Closeout migration is missing.");
  const canonicalMigrationSql = await readFile(
    `${migrationsDirectory}/${canonicalMigrationName}`,
    "utf8"
  );
  const firstBegin = canonicalMigrationSql.indexOf("begin;");
  const lastCommit = canonicalMigrationSql.lastIndexOf("\ncommit;");
  invariant(
    firstBegin >= 0 && lastCommit > firstBegin,
    "Canonical migration transaction wrapper is invalid."
  );
  const migrationBody = canonicalMigrationSql.slice(firstBegin + "begin;".length, lastCommit);
  const historicLegacySql = await readFile(
    `${migrationsDirectory}/202603270000_project_closeout.sql`,
    "utf8"
  );

  const [legacy] = await sql`
    select count(*)::integer as count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'project_closeout_punch',
        'project_closeout_warranty',
        'project_closeout_completion'
      )
  `;
  invariant(legacy.count === 0, "Legacy Closeout relations remain after reconciliation.");

  const constraints = await sql`
    select conrelid::regclass::text as relation, conname, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where conname in (
      'final_punch_lists_project_id_key',
      'warranties_project_id_key',
      'completion_certificates_project_id_key',
      'final_punch_list_items_position_check',
      'final_punch_list_items_status_check',
      'final_punch_list_items_punch_list_position_key'
    )
  `;
  invariant(constraints.length === 6, "Canonical Closeout constraints are incomplete.");

  const columns = await sql`
    select table_name, column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name in ('final_punch_lists', 'warranties', 'completion_certificates') and column_name = 'project_id')
        or (table_name = 'final_punch_list_items' and column_name in ('punch_list_id', 'position', 'status'))
      )
  `;
  invariant(columns.length === 6, "Canonical Closeout invariant columns are incomplete.");
  invariant(
    columns.every((column) => column.is_nullable === "NO"),
    "Canonical Closeout nullability is unsafe."
  );
  invariant(
    columns.find((column) => column.column_name === "status")?.column_default === "'pending'::text",
    "Punch status default is not pending."
  );

  const [routine] = await sql`
    select
      p.prosecdef,
      p.proconfig,
      p.prorettype::regtype::text as return_type,
      pg_get_function_identity_arguments(p.oid) as arguments,
      coalesce(array_to_string(p.proacl, ','), '') as acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'replace_final_punch_list'
  `;
  invariant(routine && routine.prosecdef === false, "Punch RPC is not SECURITY INVOKER.");
  invariant(routine.return_type === "uuid", "Punch RPC return type is not uuid.");
  invariant(routine.proconfig.includes('search_path=""'), "Punch RPC search_path is not empty.");
  invariant(routine.proconfig.includes("lock_timeout=5s"), "Punch RPC lock timeout is missing.");
  invariant(
    routine.proconfig.includes("statement_timeout=15s"),
    "Punch RPC statement timeout is missing."
  );
  invariant(/service_role=X/.test(routine.acl), "service_role cannot execute the punch RPC.");
  invariant(
    !/anon=X|authenticated=X|(?:\{|,)=X\//.test(routine.acl),
    "Punch RPC has a broad execute grant."
  );

  const grants = await sql`
    select grantee, table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'final_punch_lists', 'final_punch_list_items', 'warranties', 'completion_certificates'
      )
      and grantee in ('anon', 'authenticated', 'service_role')
  `;
  invariant(
    !grants.some((grant) => grant.grantee === "anon"),
    "anon retained a canonical table grant."
  );
  invariant(
    grants
      .filter((grant) => grant.grantee === "authenticated")
      .every((grant) => grant.privilege_type === "SELECT"),
    "authenticated retained canonical write access."
  );
  invariant(
    !grants.some((grant) => ["TRUNCATE", "REFERENCES", "TRIGGER"].includes(grant.privilege_type)),
    "Canonical grants are broader than the approved contract."
  );

  await sql`delete from public.projects where id = ${PROJECT_ID}::uuid`;
  await sql`insert into public.projects (id, name) values (${PROJECT_ID}::uuid, '[Local] Closeout verification')`;

  const firstId = await serviceReplace([
    { item: "Door", status: "pending" },
    { item: "Paint", status: "done" },
  ]);
  const firstItems = await orderedItems();
  invariant(
    firstItems.map((item) => item.position).join(",") === "0,1",
    "Punch order was not persisted."
  );

  const secondId = await serviceReplace([{ item: "Roof", status: "done" }]);
  invariant(firstId === secondId, "Punch parent identity changed during replacement.");
  invariant((await orderedItems()).length === 1, "Punch replacement left stale items.");

  const retryId = await serviceReplace([{ item: "Roof", status: "done" }]);
  const retryItems = await orderedItems();
  invariant(retryId === secondId, "Identical punch retry changed the parent identity.");
  invariant(
    retryItems.length === 1 &&
      retryItems[0].item === "Roof" &&
      retryItems[0].status === "done" &&
      retryItems[0].position === 0,
    "Identical punch retry did not preserve the exact final state."
  );

  await expectDatabaseFailure(
    () =>
      sql.begin(async (tx) => {
        await tx.unsafe("set local role anon");
        await tx`select public.replace_final_punch_list(${PROJECT_ID}::uuid, null, null, null, null, null, '[]'::jsonb)`;
      }),
    "anon unexpectedly executed the punch RPC."
  );
  await expectDatabaseFailure(
    () =>
      sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx`select public.replace_final_punch_list(${PROJECT_ID}::uuid, null, null, null, null, null, '[]'::jsonb)`;
      }),
    "authenticated unexpectedly executed the punch RPC."
  );

  await sql.unsafe(`
    create function public.closeout_probe_reject_item() returns trigger
    language plpgsql set search_path = '' as $$
    begin
      raise exception using errcode = 'P0001', message = 'local forced item failure';
    end
    $$;
    create trigger closeout_probe_reject_item
      before insert on public.final_punch_list_items
      for each row execute function public.closeout_probe_reject_item();
  `);
  await expectDatabaseFailure(
    () => serviceReplace([{ item: "Must rollback", status: "pending" }]),
    "Forced item failure unexpectedly committed."
  );
  await sql.unsafe(`
    drop trigger closeout_probe_reject_item on public.final_punch_list_items;
    drop function public.closeout_probe_reject_item();
  `);
  const afterFailure = await orderedItems();
  invariant(
    afterFailure.length === 1 && afterFailure[0].item === "Roof",
    "Failed replacement changed prior state."
  );

  await Promise.all([
    serviceReplace(
      [
        { item: "A1", status: "pending" },
        { item: "A2", status: "done" },
      ],
      "A"
    ),
    serviceReplace(
      [
        { item: "B1", status: "done" },
        { item: "B2", status: "pending" },
        { item: "B3", status: "done" },
      ],
      "B"
    ),
  ]);
  const concurrentItems = await orderedItems();
  const finalSet = concurrentItems.map((item) => item.item).join(",");
  invariant(
    finalSet === "A1,A2" || finalSet === "B1,B2,B3",
    "Concurrent replacements mixed item sets."
  );

  await expectDatabaseFailure(
    () => sql`insert into public.final_punch_lists (project_id) values (${PROJECT_ID}::uuid)`,
    "Duplicate punch parent was accepted."
  );
  await expectDatabaseFailure(
    () =>
      sql`update public.final_punch_list_items set status = 'unexpected' where punch_list_id = ${firstId}::uuid`,
    "Invalid punch status was accepted."
  );
  await expectDatabaseFailure(
    () =>
      sql`update public.final_punch_list_items set position = -1 where punch_list_id = ${firstId}::uuid`,
    "Negative punch position was accepted."
  );

  await sql`delete from public.projects where id = ${PROJECT_ID}::uuid`;
  const [residual] = await sql`
    select
      (select count(*)::integer from public.projects where id = ${PROJECT_ID}::uuid) as projects,
      (select count(*)::integer from public.final_punch_lists where project_id = ${PROJECT_ID}::uuid) as punch,
      (select count(*)::integer from public.warranties where project_id = ${PROJECT_ID}::uuid) as warranty,
      (select count(*)::integer from public.completion_certificates where project_id = ${PROJECT_ID}::uuid) as completion
  `;
  invariant(
    Object.values(residual).every((count) => count === 0),
    "Closeout verification fixtures remain."
  );

  for (const table of [
    "project_closeout_punch",
    "project_closeout_warranty",
    "project_closeout_completion",
  ]) {
    await expectMigrationPreflightFailure({
      label: `Nonempty ${table}`,
      migrationBody,
      historicLegacySql,
      setup: async (tx) => {
        await tx`insert into public.projects (id, name) values (${PRECHECK_PROJECT_ID}::uuid, '[Local] Preflight')`;
        await tx.unsafe(
          `insert into public.${table} (project_id) values ('${PRECHECK_PROJECT_ID}'::uuid)`
        );
      },
    });
  }

  await expectMigrationPreflightFailure({
    label: "Legacy view dependency",
    migrationBody,
    historicLegacySql,
    setup: (tx) =>
      tx.unsafe(
        "create view public.closeout_probe_view as select * from public.project_closeout_punch"
      ),
  });
  await expectMigrationPreflightFailure({
    label: "Legacy function dependency",
    migrationBody,
    historicLegacySql,
    setup: (tx) =>
      tx.unsafe(`
        create function public.closeout_probe_function()
        returns setof public.project_closeout_punch
        language sql stable set search_path = ''
        as $$ select * from public.project_closeout_punch $$
      `),
  });
  await expectMigrationPreflightFailure({
    label: "Legacy trigger dependency",
    migrationBody,
    historicLegacySql,
    setup: (tx) =>
      tx.unsafe(`
        create function public.closeout_probe_trigger_function() returns trigger
        language plpgsql set search_path = '' as $$ begin return new; end $$;
        create trigger closeout_probe_trigger before insert on public.project_closeout_punch
        for each row execute function public.closeout_probe_trigger_function()
      `),
  });
  await expectMigrationPreflightFailure({
    label: "Legacy incoming foreign key",
    migrationBody,
    historicLegacySql,
    setup: (tx) =>
      tx.unsafe(`
        create table public.closeout_probe_child (
          id uuid primary key,
          legacy_id uuid references public.project_closeout_punch(id)
        )
      `),
  });
  await expectMigrationPreflightFailure({
    label: "Unexpected legacy policy",
    migrationBody,
    historicLegacySql,
    setup: (tx) =>
      tx.unsafe(
        "create policy closeout_probe_extra_policy on public.project_closeout_punch for select to authenticated using (true)"
      ),
  });
  await expectMigrationPreflightFailure({
    label: "Legacy publication membership",
    migrationBody,
    historicLegacySql,
    setup: (tx) =>
      tx.unsafe("alter publication supabase_realtime add table public.project_closeout_punch"),
  });
  await expectMigrationPreflightFailure({
    label: "Punch items without deterministic ordering",
    migrationBody,
    historicLegacySql,
    setup: async (tx) => {
      await tx`insert into public.projects (id, name) values (${PRECHECK_PROJECT_ID}::uuid, '[Local] Preflight')`;
      const [parent] = await tx`
        insert into public.final_punch_lists (project_id)
        values (${PRECHECK_PROJECT_ID}::uuid)
        returning id
      `;
      await tx`insert into public.final_punch_list_items (punch_list_id, item, status) values (${parent.id}::uuid, 'Unknown order', 'pending')`;
    },
  });

  await verifyCompatibilityMatrix(historicLegacySql);

  console.log("Canonical Closeout reconciliation check passed.");
} finally {
  await sql`delete from public.projects where id = ${PROJECT_ID}::uuid`.catch(() => {});
  await sql
    .unsafe("drop trigger if exists closeout_probe_reject_item on public.final_punch_list_items")
    .catch(() => {});
  await sql.unsafe("drop function if exists public.closeout_probe_reject_item()").catch(() => {});
  await sql.end();
}
