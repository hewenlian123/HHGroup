import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");

const financialIndexMigrations = {
  "20260830092709_payment_received_atomic.sql": [
    "idx_payments_received_idempotency_key",
    "idx_invoice_payments_payment_received_id_unique",
  ],
  "20260830102523_reimbursement_invoice_atomic.sql": [
    "idx_invoices_idempotency_key",
    "idx_expenses_worker_reimbursement_source",
  ],
  "20260830192501_expense_bank_atomic.sql": [
    "idx_expenses_atomic_idempotency_group",
    "idx_expenses_bank_transaction_source",
    "idx_bank_transactions_reconcile_idempotency_key",
  ],
} as const;

describe("financial concurrent unique index replay safety", () => {
  for (const [filename, expectedIndexNames] of Object.entries(financialIndexMigrations)) {
    it(`${filename} repairs interrupted indexes and verifies every postcondition`, () => {
      const sql = migration(filename);
      const indexNames = Array.from(
        sql.matchAll(/create unique index concurrently if not exists\s+([a-z0-9_]+)/gi),
        (match) => match[1]
      );

      expect(indexNames).toEqual(expectedIndexNames);
      expect(sql).toContain("set statement_timeout = '0';");
      expect(sql).toContain("set statement_timeout = '60s';");
      expect(sql).toContain("i.indisunique and i.indisvalid and i.indisready and i.indimmediate");
      expect(sql).toContain("keys.ordinality <= i.indnkeyatts");
      expect(sql).toContain("pg_catalog.pg_get_expr(i.indpred, i.indrelid)");

      for (const indexName of indexNames) {
        expect(sql).toContain(`to_regclass('public.${indexName}')`);
        expect(sql).toContain(`drop index public.${indexName}`);
        expect(sql).toContain(`Financial unique index ${indexName} is not valid and ready.`);
      }
    });
  }
});
