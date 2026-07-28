import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function receiptSecurityMigration(): string {
  const migrationDir = path.join(process.cwd(), "supabase", "migrations");
  const file = fs
    .readdirSync(migrationDir)
    .find((candidate) => candidate.endsWith("_receipt_storage_security_phase1.sql"));
  expect(file, "receipt Storage security migration must exist").toBeTruthy();
  return fs.readFileSync(path.join(migrationDir, file!), "utf8");
}

describe("receipt storage security Phase 1 migration contract", () => {
  it("makes receipt buckets private and removes anonymous object access", () => {
    const sql = receiptSecurityMigration();
    expect(sql).toMatch(
      /update\s+storage\.buckets[\s\S]*set\s+public\s*=\s*false[\s\S]*'receipts'/i
    );
    expect(sql).toMatch(/drop policy[\s\S]*receipts_storage_select/i);
    expect(sql).toMatch(/drop policy[\s\S]*expense_attachments_select/i);
    expect(sql).toMatch(/revoke[\s\S]*from anon/i);
  });

  it("creates server-only cleanup evidence and an optimistic transaction function", () => {
    const sql = receiptSecurityMigration();
    expect(sql).toContain("receipt_storage_cleanup_candidates");
    expect(sql).toContain("replace_expense_receipt_reference");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/revoke all on function[\s\S]*from public/i);
    expect(sql).toMatch(/grant execute on function[\s\S]*to service_role/i);
  });

  it("does not rewrite receipt data or delete historical Storage objects", () => {
    const sql = receiptSecurityMigration();
    const migrationPrelude = sql.split(
      "create or replace function public.replace_expense_receipt_reference"
    )[0]!;
    expect(migrationPrelude).not.toMatch(/update\s+public\.expenses\s+set\s+receipt_url/i);
    expect(migrationPrelude).not.toMatch(/update\s+public\.attachments\s+set\s+file_path/i);
    expect(migrationPrelude).not.toMatch(/update\s+public\.expense_attachments\s+set\s+file_url/i);
    expect(sql).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });
});
