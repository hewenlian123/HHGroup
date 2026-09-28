import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PLAYWRIGHT_CONFIG = join(REPO_ROOT, "playwright.config.ts");
const SCHEMA_AUDIT = join(REPO_ROOT, "scripts/audit-schema-vs-code.mjs");
const temporaryRoots: string[] = [];

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });
}

function createSchemaAuditFixture(options: {
  includeMissingColumn: boolean;
  dropMissingColumnLater?: boolean;
}): string {
  const root = mkdtempSync(join(tmpdir(), "hh-schema-audit-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src/__tests__"), { recursive: true });

  writeFileSync(
    join(root, "supabase/migrations/20260101000000_fixture.sql"),
    [
      "create table public.payments (id uuid primary key);",
      'alter table if exists "public"."payments"',
      "  add column if not exists amount numeric,",
      "  add column if not exists reference text;",
      options.includeMissingColumn
        ? "alter table public.payments add column if not exists missing_in_migrations text;"
        : "",
    ].join("\n")
  );
  writeFileSync(
    join(root, "src/query.ts"),
    [
      'const query = client.from("payments")',
      '  .select("id, amount, reference, missing_in_migrations");',
      "void query;",
    ].join("\n")
  );
  if (options.dropMissingColumnLater) {
    writeFileSync(
      join(root, "supabase/migrations/20260102000000_drop_fixture_column.sql"),
      'alter table if exists "public"."payments" drop column if exists "missing_in_migrations";\n'
    );
  }
  writeFileSync(
    join(root, "src/__tests__/query.test.ts"),
    'const testDouble = client.from("payments").select("test_only_column");\nvoid testDouble;\n'
  );
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("development guardrails", () => {
  test("Playwright discovery contract includes specs and excludes colocated unit tests", () => {
    const configSource = readFileSync(PLAYWRIGHT_CONFIG, "utf8");
    const testsRoot = join(REPO_ROOT, "tests");
    const testFiles = readdirSync(testsRoot, { recursive: true }).filter(
      (path): path is string => typeof path === "string"
    );
    const playwrightSpecs = testFiles.filter((path) => path.endsWith(".spec.ts"));
    const colocatedUnitTests = testFiles.filter((path) => /\.test\.(?:js|mjs|ts|tsx)$/.test(path));

    expect(configSource).toContain('testMatch: "**/*.spec.ts"');
    expect(playwrightSpecs.length).toBeGreaterThan(0);
    expect(colocatedUnitTests.length).toBeGreaterThan(0);
    expect(playwrightSpecs).not.toEqual(expect.arrayContaining(colocatedUnitTests));
  });

  test("schema audit exits non-zero when application columns are absent from migrations", () => {
    const fixtureRoot = createSchemaAuditFixture({ includeMissingColumn: false });
    const result = run(process.execPath, [SCHEMA_AUDIT], {
      ...process.env,
      SCHEMA_AUDIT_ROOT: fixtureRoot,
    });
    const report = JSON.parse(result.stdout) as {
      missingCount: number;
      missing: Array<{ table: string; column: string }>;
    };

    expect(report).toEqual({
      missingCount: 1,
      missing: [{ table: "payments", column: "missing_in_migrations" }],
    });
    expect(result.status).toBe(1);
  });

  test("schema audit accepts complete migrations including repeated ADD COLUMN clauses", () => {
    const fixtureRoot = createSchemaAuditFixture({ includeMissingColumn: true });
    const result = run(process.execPath, [SCHEMA_AUDIT], {
      ...process.env,
      SCHEMA_AUDIT_ROOT: fixtureRoot,
    });
    const report = JSON.parse(result.stdout) as { missingCount: number; missing: unknown[] };

    expect(report).toEqual({ missingCount: 0, missing: [] });
    expect(result.status).toBe(0);
  });

  test("schema audit applies later DROP COLUMN migrations before comparing code", () => {
    const fixtureRoot = createSchemaAuditFixture({
      includeMissingColumn: true,
      dropMissingColumnLater: true,
    });
    const result = run(process.execPath, [SCHEMA_AUDIT], {
      ...process.env,
      SCHEMA_AUDIT_ROOT: fixtureRoot,
    });
    const report = JSON.parse(result.stdout) as {
      missingCount: number;
      missing: Array<{ table: string; column: string }>;
    };

    expect(report).toEqual({
      missingCount: 1,
      missing: [{ table: "payments", column: "missing_in_migrations" }],
    });
    expect(result.status).toBe(1);
  });
});
