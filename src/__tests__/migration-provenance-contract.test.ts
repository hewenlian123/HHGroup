import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const PRODUCTION_FILE = "20260801065640_restore_estimate_grants_rls_parity.sql";
const SIBLING_FILE = "20260731080335_restore_estimate_grants_rls_parity.sql";
const RAW_SHA256 = "d97cdd6462f56b4f6a2b6aa835cea573392627ccb07ae1147ca0f1a35a87b349";
const NORMALIZED_SHA256 = "474e4070650e5be94320811d0bf9bbb6f10f3cb7630d3630bba60d9254a41bbe";
const TOKEN_SHA256 = "1281a2721db891c0f05ae76b179c32ac98b342b5d710523137cbde9d33b595c8";
const PROJECTS_CANONICAL_FILE = "20260228000301_projects.sql";
const PROJECTS_LEDGER_MIRROR_FILE = "202603081650_projects.sql";
const PROJECTS_GIT_BLOB = "6704296bb567526e1eb90ac38afc2bb8cb3710c3";
const PROJECTS_RAW_SHA256 = "05e7d47b7ca634c403ab9017a837b13f963ea2e8ebce53d5a3d7296bc030ee5d";
const PROJECTS_NORMALIZED_SHA256 =
  "3d33c2838bd138339dcc0928f42912bdc9c6423cb2f9109ee81cc2e3903e6289";
const PROJECTS_TOKEN_SHA256 = "6360e7a0460d5680b28f40294c44ff3a53bb7215a293e46f1cd1947354963fc5";
const PROJECTS_STATEMENT_ARRAY_SHA256 =
  "3b06e021c294ea1d25092c520e6acca6e3d0f19eff7f9499cdb1d1455aa30e49";

type FixtureMutation = (fixtureRoot: string) => void;

function gitBlobFingerprint(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function runCheckerFixture(mutate?: FixtureMutation) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "hh-projects-provenance-"));
  const fixtureMigrations = path.join(fixtureRoot, "supabase", "migrations");
  const fixtureScripts = path.join(fixtureRoot, "scripts");
  mkdirSync(fixtureMigrations, { recursive: true });
  mkdirSync(fixtureScripts, { recursive: true });

  copyFileSync(
    path.join(ROOT, "scripts", "check-migration-order.mjs"),
    path.join(fixtureScripts, "check-migration-order.mjs")
  );
  for (const file of [PRODUCTION_FILE, PROJECTS_CANONICAL_FILE, PROJECTS_LEDGER_MIRROR_FILE]) {
    copyFileSync(path.join(MIGRATIONS, file), path.join(fixtureMigrations, file));
  }

  try {
    mutate?.(fixtureRoot);
    execFileSync("git", ["init", "-q"], { cwd: fixtureRoot });
    execFileSync("git", ["add", "."], { cwd: fixtureRoot });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=HH Test",
        "-c",
        "user.email=hh-test@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ],
      { cwd: fixtureRoot }
    );
    execFileSync(
      "git",
      [
        "-c",
        "user.name=HH Test",
        "-c",
        "user.email=hh-test@example.invalid",
        "commit",
        "--allow-empty",
        "-qm",
        "fixture head",
      ],
      { cwd: fixtureRoot }
    );

    return spawnSync(process.execPath, ["scripts/check-migration-order.mjs"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "",
        GITHUB_REF: "",
      },
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

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

describe("Projects migration provenance Option C", () => {
  it("pins the exact shared blob and all approved fingerprints", () => {
    const canonicalBytes = readFileSync(path.join(MIGRATIONS, PROJECTS_CANONICAL_FILE));
    const mirrorBytes = readFileSync(path.join(MIGRATIONS, PROJECTS_LEDGER_MIRROR_FILE));
    const checker = readFileSync(path.join(ROOT, "scripts", "check-migration-order.mjs"), "utf8");

    expect(mirrorBytes.equals(canonicalBytes)).toBe(true);
    expect(canonicalBytes).toHaveLength(2331);
    expect(sha256(canonicalBytes)).toBe(PROJECTS_RAW_SHA256);
    expect(gitBlobFingerprint(canonicalBytes)).toBe(PROJECTS_GIT_BLOB);
    expect(checker).toContain(PROJECTS_NORMALIZED_SHA256);
    expect(checker).toContain(PROJECTS_TOKEN_SHA256);
    expect(checker).toContain(PROJECTS_STATEMENT_ARRAY_SHA256);
    expect(checker).toContain("statementCount: 17");
  });

  it("passes with both unchanged historical files", () => {
    const result = runCheckerFixture();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Migration order check passed");
  });

  it.each([PROJECTS_CANONICAL_FILE, PROJECTS_LEDGER_MIRROR_FILE])(
    "fails when %s is removed",
    (file) => {
      const result = runCheckerFixture((fixtureRoot) => {
        rmSync(path.join(fixtureRoot, "supabase", "migrations", file));
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("requires both exact historical filenames");
    }
  );

  it.each([PROJECTS_CANONICAL_FILE, PROJECTS_LEDGER_MIRROR_FILE])(
    "fails after a one-byte modification of %s",
    (file) => {
      const result = runCheckerFixture((fixtureRoot) => {
        const target = path.join(fixtureRoot, "supabase", "migrations", file);
        const bytes = readFileSync(target);
        writeFileSync(target, Buffer.concat([bytes, Buffer.from("\n")]));
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("fingerprint mismatch");
    }
  );

  it("fails when a third duplicate is added", () => {
    const result = runCheckerFixture((fixtureRoot) => {
      const migrations = path.join(fixtureRoot, "supabase", "migrations");
      copyFileSync(
        path.join(migrations, PROJECTS_CANONICAL_FILE),
        path.join(migrations, "20270101000000_projects_copy.sql")
      );
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Semantic duplicate migrations");
  });

  it("fails when either approved filename is changed", () => {
    const result = runCheckerFixture((fixtureRoot) => {
      const migrations = path.join(fixtureRoot, "supabase", "migrations");
      renameSync(
        path.join(migrations, PROJECTS_LEDGER_MIRROR_FILE),
        path.join(migrations, "202603081651_projects.sql")
      );
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("requires both exact historical filenames");
  });

  it("fails when the pinned fingerprint no longer matches", () => {
    const result = runCheckerFixture((fixtureRoot) => {
      const checkerPath = path.join(fixtureRoot, "scripts", "check-migration-order.mjs");
      const checker = readFileSync(checkerPath, "utf8");
      writeFileSync(checkerPath, checker.replace(PROJECTS_RAW_SHA256, "0".repeat(64)));
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fingerprint mismatch");
  });

  it("continues to reject unrelated duplicate migrations", () => {
    const result = runCheckerFixture((fixtureRoot) => {
      const migrations = path.join(fixtureRoot, "supabase", "migrations");
      writeFileSync(path.join(migrations, "20270101000001_unrelated.sql"), "select 42;\n");
      writeFileSync(path.join(migrations, "20270101000002_unrelated.sql"), "select 42;\n");
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Semantic duplicate migrations");
  });
});
