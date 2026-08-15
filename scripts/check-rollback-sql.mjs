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
];

const sql = postgres(localDatabaseUrl, {
  max: 1,
  onnotice: () => {},
});

try {
  for (const script of scripts) {
    const source = await readFile(script.path, "utf8");
    const rollbackProbe = new Error("ROLLBACK_SQL_PROBE_COMPLETE");

    try {
      await sql.begin(async (transaction) => {
        await transaction`select set_config(
          'hh.rollback_confirmation',
          ${script.confirmation},
          true
        )`;
        await transaction.unsafe(source);
        throw rollbackProbe;
      });
    } catch (error) {
      if (error !== rollbackProbe) throw error;
    }
  }

  console.log(
    "Manual rollback SQL check passed against local Docker Supabase; all probe transactions were rolled back."
  );
} finally {
  await sql.end();
}
