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
const productionBaselineSql = join(
  process.cwd(),
  "scripts",
  "receipt-hardening-production-baseline.sql"
);
const postCutoverVerifier = join(
  process.cwd(),
  "scripts",
  "verify-worker-receipt-post-cutover.mjs"
);

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

  it("gates remaining incompatible rows on valid evidence while allowing the approved deleted-row state", () => {
    const sql = readFileSync(finalMigration, "utf8").trim();

    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/remediation_evidence_count/i);
    expect(sql).toMatch(/if incompatible_reference_count <> 0 then/i);
    expect(sql).toMatch(/if remediation_evidence_count <> remediation_audit_rows then/i);
    expect(sql).toMatch(/dangling_reimbursement_reference_count/i);
    expect(sql).toMatch(/if dangling_reimbursement_reference_count <> 0 then/i);
    expect(sql).not.toMatch(/expected exactly 2 remediation audit rows/i);
    expect(sql).toMatch(/missing_object_count/i);
    expect(sql).toMatch(/commit;$/i);
  });

  it("locks mutable receipt and Storage state before evaluating the final hardening gates", () => {
    const sql = readFileSync(finalMigration, "utf8");
    const firstGate = sql.indexOf("select count(*)\n  into remediation_audit_rows");

    expect(firstGate).toBeGreaterThan(-1);
    for (const target of [
      "public.worker_receipts",
      "public.worker_reimbursements",
      "public.worker_receipt_reference_remediations",
      "storage.objects",
      "storage.buckets",
    ]) {
      const lock = sql.indexOf(`lock table ${target} in share row exclusive mode;`);
      expect(lock).toBeGreaterThan(-1);
      expect(lock).toBeLessThan(firstGate);
    }
  });

  it("allows only valid unlinked external reimbursement evidence outside worker-receipt Storage", () => {
    const finalSql = readFileSync(finalMigration, "utf8");
    const preflight = readFileSync(preflightSql, "utf8");
    const verification = readFileSync(verificationSql, "utf8");

    expect(finalSql).toContain("invalid_reimbursement_reference_count");
    expect(finalSql).toMatch(/from public\.worker_reimbursements as reimbursement/i);
    expect(finalSql).toContain("has_linked_worker_receipt");
    expect(finalSql).toContain("is_valid_external_http_reference");
    expect(finalSql).toContain("is_worker_receipts_storage_url");
    for (const sql of [preflight, verification]) {
      expect(sql).toMatch(
        /from public\.worker_reimbursements as reimbursement\s+where reimbursement\.receipt_url is not null/i
      );
      expect(sql).toMatch(
        /from reimbursement_references as reimbursement\s+left join public\.worker_receipts as receipt/i
      );
      expect(sql).toContain("invalid_or_dangling_worker_reimbursement_receipt_links");
      expect(sql).toContain("allowed_unlinked_external_reimbursement_references");
    }
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

  it("restores the verified Production pre-cutover baseline on rollback", () => {
    const sql = readFileSync(rollbackSql, "utf8").trim();
    const fixture = readFileSync(productionBaselineSql, "utf8");

    expect(sql).toMatch(/^begin;/i);
    for (const artifact of [sql, fixture]) {
      expect(artifact).toContain("file_size_limit = null");
      expect(artifact).toContain("allowed_mime_types = null");
      expect(artifact).toContain("worker_receipts_select_all_open");
      expect(artifact).toContain("phase3a_worker_receipts_public_read");
      expect(artifact).toContain("worker_receipts_storage_select");
      expect(artifact).toContain(
        "grant select, references, trigger, truncate on table public.%I to anon"
      );
      expect(artifact).toContain(
        "grant select, insert, update, delete, references, trigger, truncate on table public.%I to authenticated"
      );
    }
    expect(sql).not.toContain("worker_receipts_bridge_public_submit");
    expect(sql).toMatch(/commit;$/i);
  });

  it("preserves expected final hardening grants while exact rollback restores the Production grants", () => {
    const migrations = [
      readFileSync(bridgeMigration, "utf8"),
      readFileSync(finalMigration, "utf8"),
    ];

    for (const sql of migrations) {
      expect(sql).toContain(
        "grant select, insert, update, delete on table public.%I to authenticated"
      );
      expect(sql).toContain(
        "grant select, insert, update, delete on table public.%I to service_role"
      );
    }

    const rollback = readFileSync(rollbackSql, "utf8");
    expect(rollback).toContain(
      "grant select, insert, update, delete, references, trigger, truncate on table public.%I to service_role"
    );
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

  it("documents ledger-safe SQL-only application for remediation and approved cleanup states", () => {
    const runbook = readFileSync(rolloutRunbook, "utf8");

    expect(runbook).toMatch(/do not use\s+`?supabase db push`?/i);
    expect(runbook).toContain("20260811040100");
    expect(runbook).toContain("20260811040201");
    expect(runbook).toContain("20260802055949");
    expect(runbook).toContain("20260802110245");
    expect(runbook).toContain("private.remediate_worker_receipt_reference(");
    expect(runbook).toContain("scripts/preflight-worker-receipt-remediation.sql");
    expect(runbook).toContain("scripts/verify-worker-receipt-remediation.sql");
    expect(runbook).toContain("scripts/verify-worker-receipt-post-cutover.mjs");
    expect(runbook).toContain("receipt-hardening-production-baseline.sql");
    expect(runbook).toContain(
      "pg_advisory_lock(hashtext('hh:receipt-hardening:selective-ledger'))"
    );
    expect(runbook).toContain("insert into supabase_migrations.schema_migrations (version, name)");
    expect(runbook).toContain("worker_receipt_legacy_bridge");
    expect(runbook).toContain("worker_receipt_rls_storage_hardening");
    expect(runbook).toMatch(/owner-approved cleanup/i);
    expect(runbook).toMatch(/zero incompatible worker-receipt references/i);
    expect(runbook).toMatch(/do not use[\s\S]*`supabase migration repair`/i);
  });

  it("provides a fail-closed executable post-cutover verifier", () => {
    const source = readFileSync(postCutoverVerifier, "utf8");

    expect(source).toContain("RECEIPT_HARDENING_EXPECTED_OBJECT_COUNT");
    expect(source).toContain("RECEIPT_HARDENING_EXPECTED_SECURITY_FINGERPRINT");
    expect(source).toContain("worker_receipt_storage_read_policies");
    expect(source).toContain("narrow_anon_upload_policy_count");
    expect(source).toContain("narrow_anon_submit_policy_count");
    expect(source).toContain("owner_admin_policy_count");
    expect(source).toContain("requireSupabaseOwnerOrAdmin");
    expect(source).toContain("SUPABASE_SERVICE_ROLE");
  });

  it("keeps the pre-bridge audit independent of the bridge audit table", () => {
    const preflight = readFileSync(preflightSql, "utf8");
    const verification = readFileSync(verificationSql, "utf8");

    expect(preflight).toContain("classified_receipts");
    expect(preflight).not.toContain("worker_receipt_reference_remediations");
    expect(verification).toContain("worker_receipt_reference_remediations");
  });

  it("qualifies receipt fields in joined link-integrity aggregates", () => {
    const preflight = readFileSync(preflightSql, "utf8");
    const verification = readFileSync(verificationSql, "utf8");

    for (const sql of [preflight, verification]) {
      const aggregate = sql.slice(sql.lastIndexOf("select\n  count(*) filter"));
      expect(aggregate).toContain("receipt.receipt_url");
      expect(aggregate).toContain("receipt.reimbursement_id");
      expect(aggregate).not.toMatch(/where\s+receipt_url\s+is\s+null/i);
    }
  });
});
