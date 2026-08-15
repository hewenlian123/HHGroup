#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = `${root}/supabase/migrations`;
const rollbacksDir = `${root}/supabase/rollbacks`;
const localDatabaseUrl =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(localDatabaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

if (!localHosts.has(parsedDatabaseUrl.hostname) || parsedDatabaseUrl.port !== "54322") {
  throw new Error(
    "worker_invoices access checks are restricted to local Docker Supabase on port 54322."
  );
}

const migrationFilename = (await readdir(migrationsDir)).find((entry) =>
  entry.endsWith("_worker_invoices_owner_admin_access.sql")
);
if (!migrationFilename) {
  throw new Error("worker_invoices owner/admin migration is missing.");
}

const migrationSource = await readFile(`${migrationsDir}/${migrationFilename}`, "utf8");
const migrationBody = migrationSource
  .replace(/^\s*begin\s*;\s*/i, "")
  .replace(/\s*commit\s*;\s*$/i, "");
const rollbackFilename = migrationFilename.replace(/\.sql$/, ".rollback.sql");
const rollbackSource = await readFile(`${rollbacksDir}/${rollbackFilename}`, "utf8");
const rollbackBody = rollbackSource.replace(/\bbegin\s*;/i, "");

const sql = postgres(localDatabaseUrl, { max: 1, onnotice: () => {} });
const rollbackProbe = new Error("WORKER_INVOICES_ACCESS_PROBE_COMPLETE");

try {
  try {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationBody);

      const [state] = await transaction`
        select
          (select relrowsecurity from pg_class where oid = 'public.worker_invoices'::regclass)
            as rls_enabled,
          has_table_privilege('anon', 'public.worker_invoices', 'select') as anon_select,
          has_table_privilege('anon', 'public.worker_invoices', 'insert') as anon_insert,
          has_table_privilege('anon', 'public.worker_invoices', 'update') as anon_update,
          has_table_privilege('anon', 'public.worker_invoices', 'delete') as anon_delete,
          has_table_privilege('authenticated', 'public.worker_invoices', 'select')
            as authenticated_select,
          has_table_privilege('authenticated', 'public.worker_invoices', 'insert')
            as authenticated_insert,
          has_table_privilege('authenticated', 'public.worker_invoices', 'update')
            as authenticated_update,
          has_table_privilege('authenticated', 'public.worker_invoices', 'delete')
            as authenticated_delete,
          has_table_privilege('service_role', 'public.worker_invoices', 'select')
            as service_select,
          has_table_privilege('service_role', 'public.worker_invoices', 'insert')
            as service_insert,
          has_table_privilege('service_role', 'public.worker_invoices', 'update')
            as service_update,
          has_table_privilege('service_role', 'public.worker_invoices', 'delete')
            as service_delete,
          (select rolbypassrls from pg_roles where rolname = 'service_role') as service_bypass_rls
      `;

      const expectedTrue = [
        "rls_enabled",
        "authenticated_select",
        "authenticated_insert",
        "authenticated_update",
        "authenticated_delete",
        "service_select",
        "service_insert",
        "service_update",
        "service_delete",
        "service_bypass_rls",
      ];
      const expectedFalse = ["anon_select", "anon_insert", "anon_update", "anon_delete"];
      for (const key of expectedTrue) {
        if (state?.[key] !== true) throw new Error(`Expected ${key}=true, got ${state?.[key]}.`);
      }
      for (const key of expectedFalse) {
        if (state?.[key] !== false) throw new Error(`Expected ${key}=false, got ${state?.[key]}.`);
      }

      const policies = await transaction`
        select policyname, cmd, roles, qual, with_check
        from pg_policies
        where schemaname = 'public' and tablename = 'worker_invoices'
        order by policyname
      `;
      if (
        policies.length !== 1 ||
        policies[0]?.policyname !== "worker_invoices_owner_admin_all" ||
        policies[0]?.cmd !== "ALL" ||
        !policies[0]?.roles?.includes("authenticated") ||
        policies[0]?.qual !== "is_owner_or_admin()" ||
        policies[0]?.with_check !== "is_owner_or_admin()"
      ) {
        throw new Error(`Unexpected worker_invoices policies: ${JSON.stringify(policies)}`);
      }

      const [fixture] = await transaction`
        insert into public.worker_invoices (amount, status)
        values (91.01, 'unpaid')
        returning id
      `;

      await transaction`select set_config(
        'request.jwt.claims',
        ${JSON.stringify({ role: "authenticated", app_metadata: { role: "assistant" } })},
        true
      )`;
      const [assistant] = await transaction`select public.is_owner_or_admin() as allowed`;
      if (assistant?.allowed !== false)
        throw new Error("Assistant claim must fail owner/admin policy.");
      await transaction.unsafe("set local role authenticated");
      const [assistantVisibility] = await transaction`
        select count(*)::integer as count
        from public.worker_invoices
        where id = ${fixture.id}
      `;
      if (assistantVisibility?.count !== 0)
        throw new Error("Assistant session must not read worker_invoices rows.");
      await transaction.unsafe("reset role");

      await transaction`select set_config(
        'request.jwt.claims',
        ${JSON.stringify({ role: "authenticated", app_metadata: { role: "owner" } })},
        true
      )`;
      const [owner] = await transaction`select public.is_owner_or_admin() as allowed`;
      if (owner?.allowed !== true) throw new Error("Owner claim must satisfy owner/admin policy.");
      await transaction.unsafe("set local role authenticated");
      const [ownerVisibility] = await transaction`
        select count(*)::integer as count
        from public.worker_invoices
        where id = ${fixture.id}
      `;
      if (ownerVisibility?.count !== 1)
        throw new Error("Owner session must read worker_invoices rows.");
      const [ownerInsert] = await transaction`
        insert into public.worker_invoices (amount, status)
        values (92.02, 'unpaid')
        returning id
      `;
      await transaction`
        update public.worker_invoices
        set status = 'paid'
        where id = ${ownerInsert.id}
      `;
      await transaction`delete from public.worker_invoices where id = ${ownerInsert.id}`;
      await transaction.unsafe("reset role");

      await transaction`select set_config(
        'request.jwt.claims',
        ${JSON.stringify({ role: "authenticated", app_metadata: { role: "admin" } })},
        true
      )`;
      await transaction.unsafe("set local role authenticated");
      const [adminVisibility] = await transaction`
        select count(*)::integer as count
        from public.worker_invoices
        where id = ${fixture.id}
      `;
      if (adminVisibility?.count !== 1)
        throw new Error("Admin session must read worker_invoices rows.");
      await transaction.unsafe("reset role");

      await transaction.unsafe("set local role service_role");
      const [serviceVisibility] = await transaction`
        select count(*)::integer as count
        from public.worker_invoices
        where id = ${fixture.id}
      `;
      if (serviceVisibility?.count !== 1)
        throw new Error("Service role must read worker_invoices rows.");
      await transaction.unsafe("reset role");

      await transaction`select set_config(
        'hh.rollback_confirmation',
        'ROLLBACK_WORKER_INVOICES_OWNER_ADMIN_ACCESS_20260815090325',
        true
      )`;
      await transaction.unsafe(rollbackBody);

      const [rollbackState] = await transaction`
        select
          has_table_privilege('anon', 'public.worker_invoices', 'select') as anon_select,
          has_table_privilege('authenticated', 'public.worker_invoices', 'select')
            as authenticated_select,
          has_table_privilege('service_role', 'public.worker_invoices', 'select')
            as service_select,
          (select count(*)::integer from pg_policies
            where schemaname = 'public' and tablename = 'worker_invoices') as policy_count
      `;
      if (
        rollbackState?.anon_select !== false ||
        rollbackState?.authenticated_select !== false ||
        rollbackState?.service_select !== true ||
        rollbackState?.policy_count !== 0
      ) {
        throw new Error(
          `Unexpected worker_invoices rollback state: ${JSON.stringify(rollbackState)}`
        );
      }

      throw rollbackProbe;
    });
  } catch (error) {
    if (error !== rollbackProbe) throw error;
  }

  console.log(
    "worker_invoices access migration and reversal passed local rollback-only verification; local schema was restored."
  );
} finally {
  await sql.end();
}
