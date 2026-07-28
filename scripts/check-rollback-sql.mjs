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
    path: `${root}/supabase/rollbacks/20260728095543_authenticated_owner_access.rollback.sql`,
    confirmation: "ROLLBACK_AUTHENTICATED_OWNER_ACCESS_20260728095543",
  },
  {
    path: `${root}/supabase/rollbacks/20260728105015_receipt_storage_security_phase1.rollback.sql`,
    confirmation: "ROLLBACK_RECEIPT_STORAGE_SECURITY_PHASE1_20260728105015",
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
