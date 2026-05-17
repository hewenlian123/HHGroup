import "./e2e-load-env";

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260517023031_remove_anon_select_bank_labor_phase3b1.sql"
);

const firstBatchTables = [
  "bank_transactions",
  "labor_entries",
  "labor_payments",
  "worker_payments",
  "worker_advances",
  "worker_reimbursements",
];

const postponedTables = [
  "workers",
  "worker_receipts",
  "expenses",
  "invoices",
  "projects",
  "customers",
  "expense_attachments",
  "payment_received_attachments",
];

const repairPolicyFiles = [
  "src/lib/ensure-schema-auto-repair.ts",
  "src/lib/ensure-labor-tables.ts",
  "src/app/labor/ensure-labor-tables-sql.ts",
];

class RollbackMigration extends Error {}

type TablePrivilegeRow = {
  table_name: string;
  anon_select: boolean;
  authenticated_select: boolean;
  authenticated_insert: boolean;
  authenticated_update: boolean;
  authenticated_delete: boolean;
  service_role_select: boolean;
};

type PolicyRow = {
  tablename: string;
  policyname: string;
  cmd: string;
  roles: string[];
};

function stripSqlComments(sql: string) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test.describe("Phase 3B-1 RLS anon read tightening draft", () => {
  test("migration removes anon SELECT from first-batch tables and preserves authenticated access", async () => {
    test.skip(
      !process.env.SUPABASE_DATABASE_URL && !process.env.DATABASE_URL,
      "Local database URL is not configured"
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = postgres(process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL!, {
      max: 1,
    });
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    let assertionError: unknown;

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(migrationSql);

        try {
          const privileges = await tx.unsafe<TablePrivilegeRow[]>(
            `
            SELECT
              table_name,
              has_table_privilege('anon', format('public.%I', table_name), 'SELECT') AS anon_select,
              has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') AS authenticated_select,
              has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') AS authenticated_insert,
              has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') AS authenticated_update,
              has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') AS authenticated_delete,
              has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') AS service_role_select
            FROM unnest($1::text[]) AS table_name
            WHERE to_regclass(format('public.%I', table_name)) IS NOT NULL
            ORDER BY table_name
          `,
            [firstBatchTables]
          );

          expect(privileges.length).toBeGreaterThan(0);
          expect(privileges.filter((row) => row.anon_select)).toEqual([]);
          expect(
            privileges.filter(
              (row) =>
                !row.authenticated_select ||
                !row.authenticated_insert ||
                !row.authenticated_update ||
                !row.authenticated_delete ||
                !row.service_role_select
            )
          ).toEqual([]);

          const anonSelectPolicies = await tx.unsafe<PolicyRow[]>(
            `
            SELECT tablename, policyname, cmd, roles::text[] AS roles
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = ANY($1::text[])
              AND cmd IN ('ALL', 'SELECT')
              AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
            ORDER BY tablename, policyname
          `,
            [firstBatchTables]
          );
          expect(anonSelectPolicies).toEqual([]);

          const authenticatedSelectPolicies = await tx.unsafe<PolicyRow[]>(
            `
            SELECT tablename, policyname, cmd, roles::text[] AS roles
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = ANY($1::text[])
              AND cmd = 'SELECT'
              AND roles @> ARRAY['authenticated']::name[]
            ORDER BY tablename, policyname
          `,
            [firstBatchTables]
          );
          const existingTables = privileges.map((row) => row.table_name);
          for (const table of existingTables) {
            expect(
              authenticatedSelectPolicies.some((policy) => policy.tablename === table),
              `${table} should retain an authenticated SELECT policy`
            ).toBe(true);
          }
        } catch (error) {
          assertionError = error;
        }

        throw new RollbackMigration();
      });
    } catch (error) {
      if (!(error instanceof RollbackMigration)) {
        throw error;
      }
    } finally {
      await sql.end({ timeout: 5 });
    }

    if (assertionError) {
      throw assertionError;
    }
  });

  test("migration scope does not include postponed tables or storage", () => {
    const migrationSql = stripSqlComments(fs.readFileSync(migrationPath, "utf8"));

    for (const table of firstBatchTables) {
      expect(migrationSql, `${table} should be in the first-batch migration`).toContain(table);
    }
    for (const table of postponedTables) {
      expect(migrationSql, `${table} is intentionally postponed`).not.toContain(table);
    }
    expect(migrationSql).not.toMatch(/\bstorage\./i);
    expect(migrationSql).not.toMatch(/\b(bucket|bucket_id)\b/i);
  });

  test("runtime repair helpers do not recreate first-batch anon SELECT policies", () => {
    for (const file of repairPolicyFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      for (const table of firstBatchTables) {
        const anonSelectForTable = new RegExp(
          `${table}[\\s\\S]{0,220}FOR\\s+SELECT[\\s\\S]{0,120}TO\\s+(?:anon|public)|FOR\\s+SELECT[\\s\\S]{0,120}TO\\s+(?:anon|public)[\\s\\S]{0,220}${table}`,
          "i"
        );
        expect(source, `${file} should not recreate anon SELECT for ${table}`).not.toMatch(
          anonSelectForTable
        );
      }
    }
  });
});
