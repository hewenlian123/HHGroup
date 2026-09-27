import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/check-migration-order.mjs");

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

function withRepository(
  untrackedMigration: string,
  assertion: (result: SpawnSyncReturns<string>) => void
): void {
  const root = mkdtempSync(join(tmpdir(), "hh-migration-order-"));
  try {
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
    writeFileSync(join(root, "supabase", "migrations", "20260830100000_base.sql"), "select 1;\n");
    git(root, "init", "--quiet");
    git(root, "config", "user.email", "migration-order-test@example.com");
    git(root, "config", "user.name", "Migration Order Test");
    git(root, "add", ".");
    git(root, "commit", "--quiet", "-m", "base migration");

    writeFileSync(join(root, "README.md"), "release candidate\n");
    git(root, "add", "README.md");
    git(root, "commit", "--quiet", "-m", "release candidate");

    writeFileSync(join(root, "supabase", "migrations", untrackedMigration), "select 2;\n");
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "",
        GITHUB_REF: "",
        GITHUB_BASE_REF: "",
      },
    });
    assertion(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("migration order gate", () => {
  it("rejects an untracked migration at or before the base tail", () => {
    withRepository("20260830090000_untracked_old.sql", (result) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Offending versions: 20260830090000");
    });
  });

  it("accepts an untracked migration after the base tail", () => {
    withRepository("20260830110000_untracked_new.sql", (result) => {
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("Migration order check passed (base max 20260830100000).");
    });
  });
});
