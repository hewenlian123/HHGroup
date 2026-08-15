import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const ROLLBACKS_DIR = path.join(ROOT, "supabase", "rollbacks");

function contractFiles(): { migration: string; rollback: string } {
  const filename = fs
    .readdirSync(MIGRATIONS_DIR)
    .find((entry) => entry.endsWith("_worker_invoices_owner_admin_access.sql"));
  expect(filename, "worker_invoices owner/admin migration must be checked in").toBeTruthy();

  const version = filename?.split("_")[0] ?? "missing";
  return {
    migration: filename ? path.join(MIGRATIONS_DIR, filename) : "",
    rollback: path.join(
      ROLLBACKS_DIR,
      `${version}_worker_invoices_owner_admin_access.rollback.sql`
    ),
  };
}

function read(file: string): string {
  return file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

describe("worker_invoices owner/admin access contract", () => {
  it("denies anon while allowing owner/admin browser CRUD and server-only service-role CRUD", () => {
    const { migration } = contractFiles();
    const sql = read(migration);

    expect(sql).toMatch(/\bbegin\s*;/i);
    expect(sql).toMatch(/\bcommit\s*;/i);
    expect(sql).toMatch(/to_regclass\s*\(\s*'public\.worker_invoices'\s*\)/i);
    expect(sql).toMatch(/to_regprocedure\s*\(\s*'public\.is_owner_or_admin\(\)'\s*\)/i);
    expect(sql).toMatch(/relrowsecurity[\s\S]*?public\.worker_invoices/i);

    expect(sql).toMatch(
      /revoke all privileges on table public\.worker_invoices from (?:public|anon)/i
    );
    expect(sql).toMatch(/revoke all privileges on table public\.worker_invoices from anon/i);
    expect(sql).toMatch(
      /grant select\s*,\s*insert\s*,\s*update\s*,\s*delete on table public\.worker_invoices to authenticated/i
    );
    expect(sql).toMatch(
      /grant select\s*,\s*insert\s*,\s*update\s*,\s*delete on table public\.worker_invoices to service_role/i
    );
    expect(sql).toMatch(
      /create policy worker_invoices_owner_admin_all[\s\S]*?for all[\s\S]*?to authenticated[\s\S]*?using\s*\(\s*public\.is_owner_or_admin\(\)\s*\)[\s\S]*?with check\s*\(\s*public\.is_owner_or_admin\(\)\s*\)/i
    );

    expect(sql).not.toMatch(/grant[\s\S]{0,160}worker_invoices[\s\S]{0,80}to anon/i);
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(
      /\b(?:delete\s+from|truncate|drop\s+table|update\s+public\.worker_invoices)\b/i
    );
  });

  it("fails closed on unexpected policy drift and removes every known legacy collision", () => {
    const { migration } = contractFiles();
    const sql = read(migration);

    expect(sql).toMatch(/unexpected[\s\S]*worker_invoices[\s\S]*policy/i);
    expect(sql).toMatch(/raise exception/i);

    for (const policy of [
      "worker_invoices_select_all",
      "worker_invoices_insert_all",
      "worker_invoices_update_all",
      "worker_invoices_delete_all",
      "allow authenticated read",
      "allow authenticated insert",
      "allow authenticated update",
      "allow authenticated delete",
      "worker_invoices_owner_admin_all",
    ]) {
      expect(sql).toContain(`drop policy if exists "${policy}" on public.worker_invoices`);
    }
  });

  it("ships a guarded, data-preserving, fail-closed reversal", () => {
    const { rollback } = contractFiles();
    expect(fs.existsSync(rollback), `${path.relative(ROOT, rollback)} must be checked in`).toBe(
      true
    );
    const sql = read(rollback);

    expect(sql).toMatch(/\bbegin\s*;/i);
    expect(sql).toContain("current_setting('hh.rollback_confirmation', true)");
    expect(sql).toContain("ROLLBACK_WORKER_INVOICES_OWNER_ADMIN_ACCESS");
    expect(sql).toMatch(/raise exception/i);
    expect(sql).not.toMatch(/\bcommit\s*;/i);
    expect(sql).toContain(
      'drop policy if exists "worker_invoices_owner_admin_all" on public.worker_invoices'
    );
    expect(sql).toMatch(/revoke all privileges on table public\.worker_invoices from anon/i);
    expect(sql).toMatch(
      /revoke all privileges on table public\.worker_invoices from authenticated/i
    );
    expect(sql).toMatch(
      /grant select\s*,\s*insert\s*,\s*update\s*,\s*delete on table public\.worker_invoices to service_role/i
    );
    expect(sql).not.toMatch(/create policy[\s\S]*?to anon/i);
    expect(sql).not.toMatch(
      /\b(?:delete\s+from|truncate|drop\s+table|update\s+public\.worker_invoices)\b/i
    );

    const rollbackCheck = read(path.join(ROOT, "scripts", "check-rollback-sql.mjs"));
    expect(rollbackCheck).toContain("worker_invoices_owner_admin_access.rollback.sql");
    expect(rollbackCheck).toContain("ROLLBACK_WORKER_INVOICES_OWNER_ADMIN_ACCESS");
  });
});
