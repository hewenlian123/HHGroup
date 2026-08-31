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
}

async function assertRollbackState(client, probe) {
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
}

try {
  for (const script of scripts) {
    const source = await readFile(script.path, "utf8");
    const rollbackProbe = new Error("ROLLBACK_SQL_PROBE_COMPLETE");

    await assertForwardState(sql, script.probe);

    try {
      await sql.begin(async (transaction) => {
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

  console.log(
    "Manual rollback SQL check passed against local Docker Supabase; all probe transactions were rolled back."
  );
} finally {
  await sql.end();
}
