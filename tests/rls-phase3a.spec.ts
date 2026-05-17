import "./e2e-load-env";

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260516130000_revoke_anon_writes_phase3a.sql"
);

const businessTables = [
  "projects",
  "customers",
  "invoices",
  "invoice_items",
  "invoice_payments",
  "estimates",
  "estimate_items",
  "project_change_orders",
  "project_change_order_items",
  "expenses",
  "expense_lines",
  "expense_attachments",
  "payment_received_attachments",
  "bank_transactions",
  "workers",
  "labor_entries",
  "worker_payments",
  "worker_advances",
  "worker_reimbursements",
  "worker_receipts",
  "company_profile",
  "categories",
  "payment_methods",
  "expense_options",
  "payment_accounts",
  "vendors",
  "commissions",
  "commission_payments",
];

const storageBuckets = [
  "branding",
  "receipts",
  "expense-attachments",
  "payment-attachments",
  "worker-receipts",
  "commission-receipts",
  "commission-payment-receipts",
  "punch-photos",
];

const repairPolicyFiles = [
  "src/lib/ensure-schema-auto-repair.ts",
  "src/lib/ensure-labor-tables.ts",
  "src/app/labor/ensure-labor-tables-sql.ts",
];

class RollbackMigration extends Error {}

type TablePrivilegeRow = {
  table_name: string;
  anon_insert: boolean;
  anon_update: boolean;
  anon_delete: boolean;
  authenticated_insert: boolean;
  authenticated_update: boolean;
  authenticated_delete: boolean;
};

type PolicyRow = {
  schemaname?: string;
  tablename?: string;
  policyname: string;
  cmd: string;
};

test.describe("Phase 3A RLS anon write tightening", () => {
  test("migration revokes anon table writes and keeps authenticated writes", async () => {
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
              has_table_privilege('anon', format('public.%I', table_name), 'INSERT') AS anon_insert,
              has_table_privilege('anon', format('public.%I', table_name), 'UPDATE') AS anon_update,
              has_table_privilege('anon', format('public.%I', table_name), 'DELETE') AS anon_delete,
              has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') AS authenticated_insert,
              has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') AS authenticated_update,
              has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') AS authenticated_delete
            FROM unnest($1::text[]) AS table_name
            WHERE to_regclass(format('public.%I', table_name)) IS NOT NULL
            ORDER BY table_name
          `,
            [businessTables]
          );

          expect(privileges.length).toBeGreaterThan(0);
          expect(
            privileges.filter((row) => row.anon_insert || row.anon_update || row.anon_delete)
          ).toEqual([]);
          expect(
            privileges.filter(
              (row) =>
                !row.authenticated_insert || !row.authenticated_update || !row.authenticated_delete
            )
          ).toEqual([]);

          const anonWritePolicies = await tx.unsafe<PolicyRow[]>(
            `
            SELECT schemaname, tablename, policyname, cmd
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = ANY($1::text[])
              AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
              AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
            ORDER BY tablename, policyname
          `,
            [businessTables]
          );
          expect(anonWritePolicies).toEqual([]);
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

  test("migration removes anon storage writes while preserving read policies", async () => {
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
          const anonWritePolicies = await tx.unsafe<PolicyRow[]>(
            `
            SELECT policyname, cmd
            FROM pg_policies
            WHERE schemaname = 'storage'
              AND tablename = 'objects'
              AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
              AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
              AND (
                qual ILIKE ANY($1::text[])
                OR with_check ILIKE ANY($1::text[])
              )
            ORDER BY policyname
          `,
            [storageBuckets.map((bucket) => `%${bucket}%`)]
          );
          expect(anonWritePolicies).toEqual([]);

          const publicReadPolicies = await tx.unsafe<Pick<PolicyRow, "policyname">[]>(
            `
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'storage'
              AND tablename = 'objects'
              AND cmd = 'SELECT'
              AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
              AND (
                qual ILIKE ANY($1::text[])
                OR with_check ILIKE ANY($1::text[])
              )
            ORDER BY policyname
          `,
            [["%branding%", "%receipts%", "%expense-attachments%"]]
          );
          expect(publicReadPolicies.length).toBeGreaterThan(0);
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

  test("runtime repair helpers do not recreate anon write policies", async () => {
    for (const file of repairPolicyFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, `${file} should not create anon INSERT policies`).not.toMatch(
        /FOR\s+INSERT[^;`]*TO\s+anon/i
      );
      expect(source, `${file} should not create anon UPDATE policies`).not.toMatch(
        /FOR\s+UPDATE[^;`]*TO\s+anon/i
      );
      expect(source, `${file} should not create anon DELETE policies`).not.toMatch(
        /FOR\s+DELETE[^;`]*TO\s+anon/i
      );
      expect(source, `${file} should not create anon ALL policies`).not.toMatch(
        /FOR\s+ALL[^;`]*TO\s+anon/i
      );
    }
  });
});
