#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
const localDatabaseUrl =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(localDatabaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

if (!localHosts.has(parsedDatabaseUrl.hostname) || parsedDatabaseUrl.port !== "54322") {
  throw new Error(
    "Rollback SQL checks are restricted to the local Docker Supabase database on port 54322."
  );
}

const scripts = [
  {
    path: `${root}/supabase/rollbacks/20260811233656_project_change_orders_owner_admin_access.rollback.sql`,
    confirmation: "ROLLBACK_PROJECT_CHANGE_ORDERS_OWNER_ADMIN_ACCESS_20260811233656",
  },
  {
    path: `${root}/supabase/rollbacks/20260811190000_financial_protected_access_contract.rollback.sql`,
    confirmation: "ROLLBACK_FINANCIAL_PROTECTED_ACCESS_CONTRACT_20260811190000",
    prerequisiteRollback: {
      path: `${root}/supabase/rollbacks/20260903031849_financial_delete_authority_closure.rollback.sql`,
      confirmation: "ROLLBACK_FINANCIAL_DELETE_AUTHORITY_CLOSURE_20260903031849",
    },
  },
  {
    path: `${root}/supabase/rollbacks/20260815090325_worker_invoices_owner_admin_access.rollback.sql`,
    confirmation: "ROLLBACK_WORKER_INVOICES_OWNER_ADMIN_ACCESS_20260815090325",
  },
  {
    path: `${root}/supabase/rollbacks/20260830014500_estimate_financial_persistence_hardening.rollback.sql`,
    probe: "estimate-meta-rpc",
  },
  {
    path: `${root}/supabase/rollbacks/20260830120000_estimate_snapshot_delete_restrict.rollback.sql`,
    probe: "estimate-snapshot-delete-action",
  },
  {
    path: `${root}/supabase/rollbacks/20260903031849_financial_delete_authority_closure.rollback.sql`,
    confirmation: "ROLLBACK_FINANCIAL_DELETE_AUTHORITY_CLOSURE_20260903031849",
    probe: "financial-delete-authority",
  },
];

const sql = postgres(localDatabaseUrl, {
  max: 1,
  onnotice: () => {},
});

async function estimateMetaRpcExists(client) {
  const [row] = await client`
    select to_regprocedure('public.update_estimate_meta_atomic(uuid,jsonb)') is not null as exists
  `;
  return row?.exists === true;
}

async function estimateSnapshotDeleteAction(client) {
  const [row] = await client`
    select constraint_record.confdeltype, constraint_record.convalidated
    from pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.estimate_snapshots'::regclass
      and constraint_record.conname = 'estimate_snapshots_estimate_id_fkey'
  `;
  return row
    ? { deleteAction: row.confdeltype, validated: row.convalidated === true }
    : { deleteAction: null, validated: false };
}

async function financialDeleteAuthorityState(client) {
  const [tablePrivileges] = await client`
    select
      bool_and(not pg_catalog.has_table_privilege('anon', table_ref, 'SELECT')) as anon_select_denied,
      bool_and(not pg_catalog.has_table_privilege('anon', table_ref, 'INSERT')) as anon_insert_denied,
      bool_and(not pg_catalog.has_table_privilege('anon', table_ref, 'UPDATE')) as anon_update_denied,
      bool_and(not pg_catalog.has_table_privilege('anon', table_ref, 'DELETE')) as anon_delete_denied,
      bool_and(not pg_catalog.has_table_privilege('authenticated', table_ref, 'DELETE')) as authenticated_delete_denied,
      bool_and(not pg_catalog.has_table_privilege('service_role', table_ref, 'DELETE')) as service_role_delete_denied,
      bool_and(pg_catalog.has_table_privilege('authenticated', table_ref, 'SELECT')) as authenticated_select,
      bool_and(pg_catalog.has_table_privilege('authenticated', table_ref, 'INSERT')) as authenticated_insert,
      bool_and(pg_catalog.has_table_privilege('authenticated', table_ref, 'UPDATE')) as authenticated_update,
      bool_and(pg_catalog.has_table_privilege('service_role', table_ref, 'SELECT')) as service_role_select,
      bool_and(pg_catalog.has_table_privilege('service_role', table_ref, 'INSERT')) as service_role_insert,
      bool_and(pg_catalog.has_table_privilege('service_role', table_ref, 'UPDATE')) as service_role_update
    from unnest(array['public.worker_payments'::regclass, 'public.ap_bills'::regclass]) as table_ref
  `;
  const [policyState] = await client`
    select
      count(*) filter (
        where tablename = 'worker_payments'
          and cmd = 'DELETE'
          and 'authenticated' = any(roles)
      )::integer as worker_authenticated_delete_policies,
      count(*) filter (
        where tablename = 'ap_bills'
          and cmd = 'ALL'
          and 'authenticated' = any(roles)
      )::integer as ap_bills_authenticated_all_policies,
      count(*) filter (
        where tablename in ('worker_payments', 'ap_bills')
          and cmd in ('DELETE', 'ALL')
          and (roles && array['public', 'anon', 'authenticated']::name[])
      )::integer as api_delete_or_all_policies
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('worker_payments', 'ap_bills')
  `;
  const [functionState] = await client`
    select
      bool_and(proowner = 'postgres'::regrole) filter (where oid in (
        'public.fn_worker_payments_before_delete()'::regprocedure,
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as all_owned_by_postgres,
      bool_and(prosecdef) filter (where oid in (
        'public.fn_worker_payments_before_delete()'::regprocedure,
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as all_security_definer,
      bool_and(not prosecdef) filter (where oid in (
        'public.fn_worker_payments_before_delete()'::regprocedure,
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as all_security_invoker,
      bool_and(proconfig = array['search_path=""']::text[]) filter (where oid in (
        'public.fn_worker_payments_before_delete()'::regprocedure,
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as empty_search_path,
      bool_and(not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')) filter (where oid in (
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as anon_rpc_denied,
      bool_and(pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')) filter (where oid in (
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as authenticated_rpc_execute,
      bool_and(pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')) filter (where oid in (
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as service_role_rpc_execute,
      bool_and(not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')) filter (where oid =
        'public.fn_worker_payments_before_delete()'::regprocedure
      ) as anon_trigger_execute_denied,
      bool_and(pg_catalog.pg_get_functiondef(oid) like '%current_user%') filter (where oid in (
        'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
        'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
      )) as rpc_body_uses_current_user
    from pg_catalog.pg_proc
    where oid in (
      'public.fn_worker_payments_before_delete()'::regprocedure,
      'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
      'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
    )
  `;
  const [predecessorMarker] = await client`
    select
      pg_catalog.to_regprocedure(
        'public.financial_delete_authority_predecessor_worker_policy_count()'
      ) is not null as predecessor_marker_exists,
      (
        select ((pg_catalog.regexp_match(p.prosrc, 'select ([34])::integer'))[1])::integer
        from pg_catalog.pg_proc p
        where p.oid = pg_catalog.to_regprocedure(
          'public.financial_delete_authority_predecessor_worker_policy_count()'
        )
      ) as predecessor_worker_policy_count
  `;
  const [ledgerPrivileges] = await client`
    select
      bool_and(not pg_catalog.has_table_privilege('anon', ledger_ref, 'SELECT')) as anon_ledger_select_denied,
      bool_and(not pg_catalog.has_table_privilege('anon', ledger_ref, 'INSERT')) as anon_ledger_insert_denied,
      bool_and(not pg_catalog.has_table_privilege('authenticated', ledger_ref, 'SELECT')) as authenticated_ledger_select_denied,
      bool_and(not pg_catalog.has_table_privilege('authenticated', ledger_ref, 'INSERT')) as authenticated_ledger_insert_denied,
      bool_and(not pg_catalog.has_table_privilege('service_role', ledger_ref, 'SELECT')) as service_role_ledger_select_denied,
      bool_and(not pg_catalog.has_table_privilege('service_role', ledger_ref, 'INSERT')) as service_role_ledger_insert_denied
    from unnest(array[
      'public.worker_payment_reversals'::regclass,
      'public.ap_bill_deletions'::regclass
    ]) as ledger_ref
  `;
  return {
    ...tablePrivileges,
    ...policyState,
    ...functionState,
    ...predecessorMarker,
    ...ledgerPrivileges,
  };
}

async function assertForwardState(client, probe) {
  if (probe === "estimate-meta-rpc" && !(await estimateMetaRpcExists(client))) {
    throw new Error("Estimate metadata RPC is missing before its rollback probe.");
  }
  if (
    probe === "estimate-snapshot-delete-action" &&
    ((await estimateSnapshotDeleteAction(client)).deleteAction !== "r" ||
      !(await estimateSnapshotDeleteAction(client)).validated)
  ) {
    throw new Error(
      "Estimate snapshot foreign key is not a validated RESTRICT constraint before its rollback probe."
    );
  }
  if (probe === "financial-delete-authority") {
    const state = await financialDeleteAuthorityState(client);
    const valid =
      state.anon_select_denied &&
      state.anon_insert_denied &&
      state.anon_update_denied &&
      state.anon_delete_denied &&
      state.authenticated_delete_denied &&
      state.service_role_delete_denied &&
      state.authenticated_select &&
      state.authenticated_insert &&
      state.authenticated_update &&
      state.service_role_select &&
      state.service_role_insert &&
      state.service_role_update &&
      state.api_delete_or_all_policies === 0 &&
      state.all_owned_by_postgres &&
      state.all_security_definer &&
      state.empty_search_path &&
      !state.rpc_body_uses_current_user &&
      state.predecessor_marker_exists &&
      [3, 4].includes(state.predecessor_worker_policy_count) &&
      state.anon_rpc_denied &&
      state.anon_trigger_execute_denied &&
      state.authenticated_rpc_execute &&
      state.service_role_rpc_execute &&
      state.anon_ledger_select_denied &&
      state.anon_ledger_insert_denied &&
      state.authenticated_ledger_select_denied &&
      state.authenticated_ledger_insert_denied &&
      state.service_role_ledger_select_denied &&
      state.service_role_ledger_insert_denied;
    if (!valid) {
      throw new Error(
        `Financial delete authority forward state is not closed: ${JSON.stringify(state)}`
      );
    }
  }
}

async function assertPredecessorRpcCallerBehavior(client) {
  await client.unsafe(`
    do $probe$
    begin
      begin
        perform public.reverse_worker_payment_atomic(
          'ffffffff-ffff-ffff-ffff-fffffffffff1',
          'rollback-probe:worker'
        );
        raise exception 'worker predecessor RPC unexpectedly succeeded';
      exception when sqlstate 'P0002' then
        null;
      end;

      begin
        perform public.delete_ap_bill_draft_atomic(
          'ffffffff-ffff-ffff-ffff-fffffffffff2',
          'rollback-probe:ap-bill'
        );
        raise exception 'AP predecessor RPC unexpectedly succeeded';
      exception when sqlstate 'P0002' then
        null;
      end;
    end
    $probe$
  `);
}

async function assertRollbackState(client, probe, expectedWorkerPolicyCount = 3) {
  if (probe === "estimate-meta-rpc" && (await estimateMetaRpcExists(client))) {
    throw new Error("Estimate metadata rollback did not remove the atomic RPC.");
  }
  if (
    probe === "estimate-snapshot-delete-action" &&
    ((await estimateSnapshotDeleteAction(client)).deleteAction !== "c" ||
      !(await estimateSnapshotDeleteAction(client)).validated)
  ) {
    throw new Error("Estimate snapshot rollback did not restore a validated ON DELETE CASCADE.");
  }
  if (probe === "financial-delete-authority") {
    const state = await financialDeleteAuthorityState(client);
    const valid =
      state.anon_select_denied &&
      state.anon_insert_denied &&
      state.anon_update_denied &&
      state.anon_delete_denied &&
      !state.authenticated_delete_denied &&
      !state.service_role_delete_denied &&
      state.worker_authenticated_delete_policies === expectedWorkerPolicyCount &&
      state.ap_bills_authenticated_all_policies === 1 &&
      state.all_owned_by_postgres &&
      state.all_security_invoker &&
      state.empty_search_path &&
      state.rpc_body_uses_current_user &&
      !state.predecessor_marker_exists &&
      state.predecessor_worker_policy_count == null &&
      state.anon_rpc_denied &&
      state.anon_trigger_execute_denied &&
      state.authenticated_rpc_execute &&
      state.service_role_rpc_execute &&
      state.anon_ledger_select_denied &&
      state.anon_ledger_insert_denied &&
      !state.authenticated_ledger_select_denied &&
      !state.authenticated_ledger_insert_denied &&
      !state.service_role_ledger_select_denied &&
      !state.service_role_ledger_insert_denied;
    if (!valid) {
      throw new Error(
        `Financial delete authority rollback state is not restored: ${JSON.stringify(state)}`
      );
    }
    await assertPredecessorRpcCallerBehavior(client);
  }
}

try {
  for (const script of scripts) {
    const source = await readFile(script.path, "utf8");
    const rollbackProbe = new Error("ROLLBACK_SQL_PROBE_COMPLETE");

    await assertForwardState(sql, script.probe);

    try {
      await sql.begin(async (transaction) => {
        if (script.prerequisiteRollback) {
          const prerequisiteSource = await readFile(script.prerequisiteRollback.path, "utf8");
          await transaction`select set_config(
            'hh.rollback_confirmation',
            ${script.prerequisiteRollback.confirmation},
            true
          )`;
          await transaction.unsafe(prerequisiteSource);
          await assertRollbackState(transaction, "financial-delete-authority");
        }
        if (script.confirmation) {
          await transaction`select set_config(
            'hh.rollback_confirmation',
            ${script.confirmation},
            true
          )`;
        }
        await transaction.unsafe(source);
        await assertRollbackState(transaction, script.probe);
        throw rollbackProbe;
      });
    } catch (error) {
      if (error !== rollbackProbe) throw error;
    }

    await assertForwardState(sql, script.probe);
  }

  const financialRollback = scripts.find((script) => script.probe === "financial-delete-authority");
  const fourPolicyRollbackProbe = new Error("FOUR_POLICY_ROLLBACK_PROBE_COMPLETE");
  const financialRollbackSource = await readFile(financialRollback.path, "utf8");
  try {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(`
        create or replace function public.financial_delete_authority_predecessor_worker_policy_count()
        returns integer
        language sql
        immutable
        security invoker
        set search_path = ''
        as $marker$ select 4::integer $marker$
      `);
      await transaction`select set_config(
        'hh.rollback_confirmation',
        ${financialRollback.confirmation},
        true
      )`;
      await transaction.unsafe(financialRollbackSource);
      await assertRollbackState(transaction, "financial-delete-authority", 4);
      throw fourPolicyRollbackProbe;
    });
  } catch (error) {
    if (error !== fourPolicyRollbackProbe) throw error;
  }

  await assertForwardState(sql, "financial-delete-authority");

  console.log(
    "Manual rollback SQL check passed against local Docker Supabase; all probe transactions were rolled back."
  );
} finally {
  await sql.end();
}
