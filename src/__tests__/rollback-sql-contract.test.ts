import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION_A_ROLLBACK = path.join(
  ROOT,
  "supabase/rollbacks/20260728095543_authenticated_owner_access.rollback.sql"
);
const MIGRATION_B_ROLLBACK = path.join(
  ROOT,
  "supabase/rollbacks/20260728105015_receipt_storage_security_phase1.rollback.sql"
);

function rollbackSql(file: string): string {
  expect(fs.existsSync(file), `${path.relative(ROOT, file)} must be checked in`).toBe(true);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function expectManualTransactionalGuard(sql: string, confirmation: string): void {
  expect(sql).toMatch(/\bbegin\s*;/i);
  expect(sql).toContain("current_setting('hh.rollback_confirmation', true)");
  expect(sql).toContain(confirmation);
  expect(sql).toMatch(/raise exception/i);
  expect(sql).not.toMatch(/\bcommit\s*;/i);
}

function expectNoHistoricalDataMutation(sql: string): void {
  expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  expect(sql).not.toMatch(/\btruncate\b/i);
  expect(sql).not.toMatch(/\bupdate\s+public\.(expenses|attachments|expense_attachments)\b/i);
  expect(sql).not.toMatch(/\bdrop\s+table\b/i);
}

describe("manual production rollback SQL contracts", () => {
  it("Migration A rollback is guarded and restores the captured compatibility access", () => {
    const sql = rollbackSql(MIGRATION_A_ROLLBACK);
    expectManualTransactionalGuard(sql, "ROLLBACK_AUTHENTICATED_OWNER_ACCESS_20260728095543");
    expectNoHistoricalDataMutation(sql);

    for (const policy of ["attachments_insert", "attachments_update", "attachments_delete"]) {
      expect(sql).toContain(`policy ${policy}`);
    }
    expect(sql).toMatch(/to\s+anon\s*,\s*authenticated/i);
    expect(sql).toMatch(
      /grant select\s*,\s*insert\s*,\s*update\s*,\s*delete on table public\.subcontract_deductions to anon/i
    );
    expect(sql).toMatch(/legacy PIN cannot be reconstructed automatically/i);
    expect(sql).not.toMatch(
      /\bdrop\s+(table|function).*?(app_user_security_settings|security_audit_events)/i
    );
  });

  it("Migration B rollback restores the exact captured bucket policies without receipt mutation", () => {
    const sql = rollbackSql(MIGRATION_B_ROLLBACK);
    expectManualTransactionalGuard(sql, "ROLLBACK_RECEIPT_STORAGE_SECURITY_PHASE1_20260728105015");
    expectNoHistoricalDataMutation(sql);

    expect(sql).toMatch(
      /update\s+storage\.buckets\s+set\s+public\s*=\s*true\s+where\s+id\s*=\s*'receipts'/i
    );
    expect(sql).toMatch(
      /update\s+storage\.buckets\s+set\s+public\s*=\s*false\s+where\s+id\s*=\s*'expense-attachments'/i
    );

    const baselinePolicies = [
      "expense_attachments_select",
      "receipts_storage_select",
      "phase3a_expense_attachments_public_read",
      "phase3a_expense_attachments_authenticated_insert",
      "phase3a_expense_attachments_authenticated_update",
      "phase3a_expense_attachments_authenticated_delete",
      "phase3a_receipts_public_read",
      "phase3a_receipts_authenticated_insert",
      "phase3a_receipts_authenticated_update",
      "phase3a_receipts_authenticated_delete",
    ];
    for (const policy of baselinePolicies) {
      expect(sql).toContain(`policy "${policy}"`);
    }

    expect(sql).not.toMatch(
      /\b(update|delete\s+from)\s+public\.(expenses|attachments|expense_attachments|receipt_queue)\b/i
    );
    expect(sql).not.toMatch(/\bdrop\s+table\s+public\.receipt_storage_cleanup_candidates\b/i);
  });
});
