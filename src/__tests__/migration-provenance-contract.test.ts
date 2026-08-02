import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const PRODUCTION_FILE = "20260801065640_restore_estimate_grants_rls_parity.sql";
const SIBLING_FILE = "20260731080335_restore_estimate_grants_rls_parity.sql";
const RAW_SHA256 = "d97cdd6462f56b4f6a2b6aa835cea573392627ccb07ae1147ca0f1a35a87b349";
const NORMALIZED_SHA256 = "474e4070650e5be94320811d0bf9bbb6f10f3cb7630d3630bba60d9254a41bbe";
const TOKEN_SHA256 = "1281a2721db891c0f05ae76b179c32ac98b342b5d710523137cbde9d33b595c8";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}

describe("estimate grants migration provenance", () => {
  it("keeps exactly the Production-ledger representation", () => {
    const files = readdirSync(MIGRATIONS);

    expect(files).toContain(PRODUCTION_FILE);
    expect(files).not.toContain(SIBLING_FILE);
  });

  it("preserves the Git-proven raw and normalized SQL fingerprints", () => {
    const bytes = readFileSync(path.join(MIGRATIONS, PRODUCTION_FILE));
    const sql = bytes.toString("utf8");

    expect(sha256(bytes)).toBe(RAW_SHA256);
    expect(sha256(normalizeSql(sql))).toBe(NORMALIZED_SHA256);
  });

  it("does not retain a second normalized copy under another migration version", () => {
    const targetSql = readFileSync(path.join(MIGRATIONS, PRODUCTION_FILE), "utf8");
    const targetFingerprint = sha256(normalizeSql(targetSql));
    const semanticCopies = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith(".sql"))
      .filter((file) => {
        const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
        return sha256(normalizeSql(sql)) === targetFingerprint;
      });

    expect(semanticCopies).toEqual([PRODUCTION_FILE]);
  });

  it("requires the CI checker to preserve the SQL-token fingerprint and reject any duplicate", () => {
    const checker = readFileSync(path.join(ROOT, "scripts/check-migration-order.mjs"), "utf8");

    expect(checker).toContain(TOKEN_SHA256);
    expect(checker).toContain("sqlTokenFingerprint");
    expect(checker).toContain("Semantic duplicate migrations");
  });
});
