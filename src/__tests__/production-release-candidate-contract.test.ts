import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ACCESS_MIGRATIONS = [
  "20260811190000_financial_protected_access_contract.sql",
  "20260811233656_project_change_orders_owner_admin_access.sql",
];

const ACCESS_ROLLBACKS = [
  "20260811190000_financial_protected_access_contract.rollback.sql",
  "20260811233656_project_change_orders_owner_admin_access.rollback.sql",
];

function source(relativePath: string): string {
  const file = resolve(ROOT, relativePath);
  expect(existsSync(file), `${relativePath} must be tracked`).toBe(true);
  return readFileSync(file, "utf8");
}

function isGitTracked(relativePath: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
      cwd: ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

describe("production release candidate contract", () => {
  it("ships only the two new certified access migrations with guarded rollbacks", () => {
    for (const migration of ACCESS_MIGRATIONS) {
      source(`supabase/migrations/${migration}`);
    }

    for (const rollback of ACCESS_ROLLBACKS) {
      const sql = source(`supabase/rollbacks/${rollback}`);
      expect(sql).toMatch(/\bbegin\s*;/i);
      expect(sql).toContain("current_setting('hh.rollback_confirmation', true)");
      expect(sql).toMatch(/raise exception/i);
      expect(sql).not.toMatch(/\bcommit\s*;/i);
      expect(sql).not.toMatch(/\bto\s+anon\b[\s\S]{0,180}\busing\s*\(\s*true\s*\)/i);
    }

    expect(
      existsSync(
        resolve(ROOT, "supabase/migrations/20260811184720_labor_workers_owner_admin_access.sql")
      )
    ).toBe(false);
  });

  it("keeps Receipt Security limited to active named projects(id,name)", () => {
    const sql = source(
      "supabase/migrations/20260811233656_project_change_orders_owner_admin_access.sql"
    );

    expect(sql).toMatch(
      /grant\s+select\s*\(\s*id\s*,\s*name\s*\)\s+on\s+table\s+public\.projects\s+to\s+anon/i
    );
    expect(sql).toMatch(/create\s+policy\s+worker_receipt_options_projects_anon_select/i);
    expect(sql).toMatch(/lower\(btrim\(coalesce\(status,\s*''\)\)\)\s*=\s*'active'/i);
    expect(sql).toMatch(/btrim\(coalesce\(name,\s*''\)\)\s*<>\s*''/i);
    expect(sql).not.toMatch(/to\s+anon\s+using\s*\(\s*true\s*\)/i);
  });

  it("keeps the financial rollback fingerprint aligned with its migration", () => {
    const migration = source(
      "supabase/migrations/20260811190000_financial_protected_access_contract.sql"
    );
    const rollback = source(
      "supabase/rollbacks/20260811190000_financial_protected_access_contract.rollback.sql"
    );
    const financialTables = [
      "invoices",
      "invoice_items",
      "invoice_payments",
      "payments_received",
      "payment_received_attachments",
      "deposits",
      "ap_bills",
      "ap_bill_payments",
      "subcontract_payments",
      "expense_lines",
      "commissions",
      "commission_payments",
      "subcontractors",
      "subcontracts",
    ];

    for (const table of financialTables) {
      expect(migration).toContain(`'${table}'`);
      expect(rollback).toContain(`'${table}'`);
    }
    expect(rollback).not.toMatch(/subcontract_bills|project_commissions|owner_admin_read/i);
  });

  it("keeps the Production-recorded estimate filename and Production-only provenance files", () => {
    source("supabase/migrations/20260801065640_restore_estimate_grants_rls_parity.sql");
    source("supabase/migrations/20260802055949_project_pdf_documents_expand.sql");
    source("supabase/migrations/20260802110245_canonical_closeout_reconciliation.sql");
    const orderCheck = source("scripts/check-migration-order.mjs");
    expect(orderCheck).toContain("20260801065640_restore_estimate_grants_rls_parity.sql");
    expect(orderCheck).toContain("20260802055949_project_pdf_documents_expand.sql");
    expect(orderCheck).toContain("20260802110245_canonical_closeout_reconciliation.sql");
    expect(
      existsSync(
        resolve(ROOT, "supabase/migrations/20260731080335_restore_estimate_grants_rls_parity.sql")
      )
    ).toBe(false);
  });

  it("excludes local Supabase CLI state from the release artifact", () => {
    expect(isGitTracked("supabase/.temp/cli-latest")).toBe(false);
  });

  it("ships an operator-only migration gate with no db push or repair path", () => {
    const workflow = source(".github/workflows/manual-production-supabase-migration.yml");
    const runbook = source("docs/PRODUCTION_MIGRATION_RELEASE_REPAIR.md");

    expect(workflow).not.toMatch(/supabase\s+db\s+push/i);
    expect(workflow).not.toMatch(/supabase\s+migration\s+repair/i);
    expect(workflow).toContain("No database mutation is available from this workflow.");
    expect(runbook).toContain("20260801065640_restore_estimate_grants_rls_parity");
    expect(runbook).toContain("20260802055949_project_pdf_documents_expand");
    expect(runbook).toContain("20260802110245_canonical_closeout_reconciliation");
    expect(runbook).toMatch(/do not use `supabase db push`/i);
  });
});
