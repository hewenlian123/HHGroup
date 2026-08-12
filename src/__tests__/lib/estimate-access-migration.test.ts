import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260801065640_restore_estimate_grants_rls_parity.sql"
);

function migrationSql(): string {
  expect(fs.existsSync(MIGRATION)).toBe(true);
  return fs.readFileSync(MIGRATION, "utf8");
}

describe("Estimate access parity migration", () => {
  it("keeps Estimate reads available while routing writes through authenticated/server roles", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /grant\s+select\s+on\s+table\s+public\.(?:estimates|estimate_meta)[\s\S]*to\s+anon/i
    );
    expect(sql).toMatch(/grant\s+select\s+on\s+table\s+public\.projects\s+to\s+anon/i);
    expect(sql).toMatch(
      /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*to\s+authenticated/i
    );
    expect(sql).toMatch(
      /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*estimate_templates[\s\S]*to\s+service_role/i
    );
    expect(sql).toMatch(
      /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*payments_received[\s\S]*deposits[\s\S]*to\s+service_role/i
    );
    expect(sql).toMatch(/revoke\s+insert\s*,\s*update\s*,\s*delete[\s\S]*from\s+anon/i);
    expect(sql).not.toMatch(/grant\s+(?:select\s*,\s*)?(?:insert|update|delete)[\s\S]*to\s+anon/i);
  });

  it("removes legacy anonymous write policies without destructive data changes", () => {
    const sql = migrationSql();

    for (const table of ["estimate_meta", "estimate_categories", "estimate_snapshots"]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_insert_all ON public.${table}`);
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_update_all ON public.${table}`);
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_delete_all ON public.${table}`);
    }

    expect(sql).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
  });

  it("uses the Production-recorded filename without reintroducing the obsolete rollback", () => {
    expect(
      fs.existsSync(
        path.join(
          process.cwd(),
          "supabase/migrations/20260731080335_restore_estimate_grants_rls_parity.sql"
        )
      )
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          process.cwd(),
          "supabase/rollbacks/20260731080335_restore_estimate_grants_rls_parity.rollback.sql"
        )
      )
    ).toBe(false);
  });
});
