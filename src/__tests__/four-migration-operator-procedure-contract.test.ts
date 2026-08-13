import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const RELEASE_MIGRATIONS = [
  {
    version: "20260811190000",
    file: "20260811190000_financial_protected_access_contract.sql",
    name: "financial_protected_access_contract",
  },
  {
    version: "20260811233656",
    file: "20260811233656_project_change_orders_owner_admin_access.sql",
    name: "project_change_orders_owner_admin_access",
  },
  {
    version: "20260812103821",
    file: "20260812103821_production_security_baseline_closure.sql",
    name: "production_security_baseline_closure",
  },
  {
    version: "20260813002206",
    file: "20260813002206_final_anonymous_crud_closure.sql",
    name: "final_anonymous_crud_closure",
  },
] as const;

const OPERATOR_PROCEDURE =
  "docs/release-operations/2026-08-13-final-anonymous-crud-closure/FOUR_MIGRATION_OPERATOR_PROCEDURE.sql";
const OPERATOR_RECORD =
  "docs/release-operations/2026-08-13-final-anonymous-crud-closure/FOUR_MIGRATION_OPERATOR_RECORD.md";
const HISTORICAL_PROVENANCE =
  "docs/release-operations/2026-08-13-final-anonymous-crud-closure/HISTORICAL_MIGRATION_PROVENANCE_READ_ONLY.md";

function source(relativePath: string): string {
  const file = resolve(ROOT, relativePath);
  expect(existsSync(file), `${relativePath} must be tracked`).toBe(true);
  return readFileSync(file, "utf8");
}

function transactionControlStatements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter((line) => /^(begin|commit|rollback|start\s+transaction)\s*;$/i.test(line));
}

describe("four-migration operator procedure contract", () => {
  it("keeps every forward migration transaction-neutral for operator ownership", () => {
    for (const migration of RELEASE_MIGRATIONS) {
      const sql = source(`supabase/migrations/${migration.file}`);
      expect(transactionControlStatements(sql)).toEqual([]);
    }
  });

  it("records one exact ledger version and name under a transaction-scoped advisory lock", () => {
    const procedure = source(OPERATOR_PROCEDURE);

    expect(procedure).toMatch(/\\set\s+ON_ERROR_STOP\s+off/i);
    expect(procedure).toMatch(/pg_advisory_xact_lock/i);
    expect(procedure).toMatch(/supabase_migrations\.schema_migrations/i);
    expect(procedure).toMatch(/\\if\s+:ERROR/i);
    expect(procedure).toMatch(/rollback\s*;/i);
    expect(procedure).toMatch(/\\quit/i);
    expect(procedure).not.toMatch(
      /supabase\s+db\s+push|supabase\s+migration\s+up|migration\s+repair|db\s+reset/i
    );

    for (const migration of RELEASE_MIGRATIONS) {
      expect(procedure).toContain(`supabase/migrations/${migration.file}`);
      expect(procedure).toContain(`'${migration.version}'`);
      expect(procedure).toContain(`'${migration.name}'`);
    }

    expect(procedure.match(/\bbegin\s*;/gi)).toHaveLength(4);
    expect(procedure.match(/\bcommit\s*;/gi)).toHaveLength(4);
    expect(procedure.match(/\brollback\s*;/gi)?.length).toBeGreaterThanOrEqual(4);

    for (const step of [1, 2, 3, 4]) {
      expect(procedure).toMatch(
        new RegExp(
          `step ${step} commit failed; stop and preserve evidence\\.'\\s*\\n\\s*rollback;\\s*\\n\\s*\\\\quit`,
          "i"
        )
      );
    }
  });

  it("keeps the rollout record bound to the same four-migration atomic procedure", () => {
    const record = source(OPERATOR_RECORD);

    expect(record).toContain("d3f007ddc6347e66dc2c822bd48dfa36f1acb028");
    expect(record).toContain("FOUR_MIGRATION_OPERATOR_PROCEDURE.sql");
    expect(record).toMatch(/same transaction/i);
    expect(record).toMatch(/advisory lock/i);
    expect(record).toMatch(/rollback and stop/i);

    for (const migration of RELEASE_MIGRATIONS) {
      expect(record).toContain(migration.file);
      expect(record).toContain(migration.version);
    }
  });

  it("keeps the required historical-ledger preflight immutable and read-only", () => {
    const provenance = source(HISTORICAL_PROVENANCE);

    expect(provenance).toContain("d3f007ddc6347e66dc2c822bd48dfa36f1acb028");
    expect(provenance).toMatch(/read-only/i);
    expect(provenance).toMatch(/do not replay/i);
    expect(provenance).toMatch(/do not repair/i);
    expect(provenance).toContain("20260801065640");
    expect(provenance).toContain("20260802055949");
    expect(provenance).toContain("20260802110245");
  });
});
