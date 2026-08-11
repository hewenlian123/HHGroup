import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bridgeMigration = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260811040100_worker_receipt_legacy_bridge.sql"
);
const finalMigration = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260811040201_worker_receipt_rls_storage_hardening.sql"
);
const rollbackSql = join(process.cwd(), "scripts", "receipt-hardening-rollback.sql");
const rolloutRunbook = join(process.cwd(), "docs", "RECEIPT_HARDENING_LEDGER_SAFE_ROLLOUT.md");
const schemaAutoRepair = join(process.cwd(), "src", "lib", "ensure-schema-auto-repair.ts");
const preflightSql = join(process.cwd(), "scripts", "preflight-worker-receipt-remediation.sql");
const verificationSql = join(process.cwd(), "scripts", "verify-worker-receipt-remediation.sql");

describe("worker receipt bridge contract", () => {
  it("preserves legacy submission without granting receipt reads or destructive table privileges", () => {
    const sql = readFileSync(bridgeMigration, "utf8");

    expect(sql).toContain("worker_receipts_bridge_public_submit");
    expect(sql).toContain("worker_receipts_owner_admin_select");
    expect(sql).not.toContain("worker_receipts_bridge_anon_select");
    expect(sql).not.toContain("worker_receipts_bridge_authenticated_all");
    expect(sql).not.toMatch(
      /grant\s+select\s*,\s*(?:references\s*,\s*)?(?:trigger\s*,\s*)?(?:truncate\s*,\s*)?\s*on\s+table\s+public\.worker_receipts\s+to\s+anon/i
    );
    expect(sql).not.toMatch(
      /grant[^;]*\b(references|trigger|truncate)\b[^;]*on\s+table\s+public\.worker_receipts\s+to\s+anon/i
    );
  });

  it("audits and atomically remediates each linked reimbursement without deletion", () => {
    const sql = readFileSync(bridgeMigration, "utf8");
    const remediationSignature = sql.slice(
      sql.indexOf("create or replace function private.remediate_worker_receipt_reference"),
      sql.indexOf(
        "language plpgsql",
        sql.indexOf("create or replace function private.remediate_worker_receipt_reference")
      )
    );

    expect(sql).toContain("worker_receipt_reference_remediations");
    expect(sql).toContain("private.remediate_worker_receipt_reference");
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/update\s+public\.worker_reimbursements/i);
    expect(sql).toMatch(/update\s+public\.worker_receipts/i);
    expect(sql).toMatch(/insert into\s+public\.worker_receipt_reference_remediations/i);
    expect(remediationSignature).not.toContain("old_receipt_url");
    expect(sql).not.toMatch(
      /delete\s+from\s+(public\.)?(worker_receipts|worker_reimbursements|storage\.objects)/i
    );
  });

  it("gates the final hardening on exactly two complete remediations", () => {
    const sql = readFileSync(finalMigration, "utf8").trim();

    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/expected exactly 2 remediation audit rows/i);
    expect(sql).toMatch(/incomplete_remediation_count/i);
    expect(sql).toMatch(/missing_object_count/i);
    expect(sql).toMatch(/commit;$/i);
  });

  it("fails closed when the worker-receipts bucket is missing", () => {
    const artifacts = [
      readFileSync(bridgeMigration, "utf8"),
      readFileSync(finalMigration, "utf8"),
      readFileSync(rollbackSql, "utf8"),
    ];

    for (const sql of artifacts) {
      expect(sql).toContain("Receipt hardening blocked: worker-receipts bucket is missing");
    }
  });

  it("restores only the narrow bridge on rollback", () => {
    const sql = readFileSync(rollbackSql, "utf8").trim();

    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/worker_receipts_bridge_public_submit/i);
    expect(sql).toContain("worker_receipts_owner_admin_select");
    expect(sql).not.toContain("worker_receipts_bridge_anon_select");
    expect(sql).not.toContain("worker_receipts_bridge_authenticated_all");
    expect(sql).not.toMatch(
      /grant[^;]*\b(references|trigger|truncate)\b[^;]*on\s+table\s+public\.worker_receipts\s+to\s+anon/i
    );
    expect(sql).toMatch(/commit;$/i);
  });

  it("preserves standard authenticated and service-role worker/project access after revoking PUBLIC", () => {
    const migrations = [
      readFileSync(bridgeMigration, "utf8"),
      readFileSync(finalMigration, "utf8"),
      readFileSync(rollbackSql, "utf8"),
    ];

    for (const sql of migrations) {
      expect(sql).toContain(
        "grant select, insert, update, delete on table public.%I to authenticated"
      );
      expect(sql).toContain(
        "grant select, insert, update, delete on table public.%I to service_role"
      );
    }
  });

  it("keeps Storage policy changes out of runtime schema auto-repair", () => {
    const source = readFileSync(schemaAutoRepair, "utf8");
    const workerReceiptSection = source.slice(
      source.indexOf("// 7. worker_receipts"),
      source.indexOf("// 8. attachments")
    );

    expect(workerReceiptSection).not.toContain("storage.buckets");
    expect(workerReceiptSection).not.toContain("storage.objects");
  });

  it("documents ledger-safe SQL-only application and the two-row procedure", () => {
    const runbook = readFileSync(rolloutRunbook, "utf8");

    expect(runbook).toMatch(/do not use\s+`?supabase db push`?/i);
    expect(runbook).toContain("20260811040100");
    expect(runbook).toContain("20260811040201");
    expect(runbook).toContain("20260802055949");
    expect(runbook).toContain("20260802110245");
    expect(runbook).toContain("private.remediate_worker_receipt_reference(");
    expect(runbook).toContain("scripts/preflight-worker-receipt-remediation.sql");
    expect(runbook).toContain("scripts/verify-worker-receipt-remediation.sql");
    expect(runbook).toContain("supabase migration repair --linked --status applied 20260811040100");
    expect(runbook).toContain("supabase migration repair --linked --status applied 20260811040201");
  });

  it("keeps the pre-bridge audit independent of the bridge audit table", () => {
    const preflight = readFileSync(preflightSql, "utf8");
    const verification = readFileSync(verificationSql, "utf8");

    expect(preflight).toContain("classified_receipts");
    expect(preflight).not.toContain("worker_receipt_reference_remediations");
    expect(verification).toContain("worker_receipt_reference_remediations");
  });
});
