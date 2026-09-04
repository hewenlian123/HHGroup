import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION = path.join(
  ROOT,
  "supabase/migrations/20260823051715_estimate_owner_admin_grants_closure.sql"
);
const ROLLBACK = path.join(
  ROOT,
  "supabase/rollbacks/20260823051715_estimate_owner_admin_grants_closure.rollback.sql"
);

const TARGET_TABLES = [
  "estimates",
  "estimate_meta",
  "estimate_items",
  "estimate_categories",
  "estimate_snapshots",
  "estimate_payment_schedule_items",
  "estimate_templates",
] as const;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function compact(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Estimate least-privilege grants closure", () => {
  it("fails closed over the exact existing Estimate table set", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");

    for (const table of TARGET_TABLES) {
      expect(sql).toContain(`'${table}'`);
      expect(sql).toContain(
        `raise exception 'R1B.1 Estimate grants closure requires public.%', target_table`
      );
    }

    expect(sql).toMatch(/alter table public\.%I enable row level security/i);
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(/\bdrop\s+(?:table|column)\b/i);
    expect(sql).not.toMatch(/\btruncate\s+table\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it("denies anon and limits authenticated to owner/admin SELECT", () => {
    const sql = compact(fs.readFileSync(MIGRATION, "utf8"));

    expect(sql).toContain("from public, anon, authenticated, service_role;");
    expect(sql).not.toMatch(/\bto anon\b/);
    expect(sql).not.toMatch(
      /grant\s+(?:select\s*,\s*)?(?:insert|update|delete|truncate|references|trigger|maintain)[^;]*\bto authenticated\b/
    );
    expect(sql.match(/for select to authenticated/g)).toHaveLength(6);
    expect(sql.match(/using \(\(select public\.is_owner_or_admin\(\)\)\)/g)).toHaveLength(6);
    expect(sql).not.toContain("estimate_templates_owner_admin_select");
  });

  it("retains only bounded server-role table, sequence, and function capability", () => {
    const sql = compact(fs.readFileSync(MIGRATION, "utf8"));

    expect(sql).toMatch(
      /grant select, insert, update, delete on table public\.estimates,[^;]*public\.estimate_templates to service_role;/
    );
    expect(sql).toContain(
      "grant select, insert on table public.estimate_snapshots to service_role;"
    );
    expect(sql).not.toMatch(
      /grant\s+[^;]*(?:update|delete)[^;]*public\.estimate_snapshots[^;]*to service_role/
    );
    expect(sql).toContain(
      "revoke all privileges on sequence public.estimate_number_seq from public, anon, authenticated, service_role;"
    );
    expect(sql).toContain("grant usage on sequence public.estimate_number_seq to service_role;");
    expect(sql).toContain(
      "revoke all on function public.next_estimate_number() from public, anon, authenticated, service_role;"
    );
    expect(sql).toContain(
      "grant execute on function public.next_estimate_number() to service_role;"
    );
    expect(sql).not.toMatch(/grant execute[^;]*to (?:anon|authenticated)/);
  });

  it("ships a fail-closed rollback instead of restoring the insecure legacy ACL", () => {
    const sql = compact(fs.readFileSync(ROLLBACK, "utf8"));

    expect(sql).toContain("from public, anon, authenticated, service_role;");
    expect(sql).not.toMatch(/\bto anon\b/);
    expect(sql).not.toMatch(/\bto authenticated\b/);
    expect(sql).toContain(
      "grant select, insert on table public.estimate_snapshots to service_role;"
    );
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/);
    expect(sql).not.toMatch(/\btruncate\s+table\b|\bdelete\s+from\b|\bupdate\s+public\./);
  });

  it("propagates the request-cookie client through protected Estimate SSR reads", () => {
    const listPage = read("src/app/estimates/page.tsx");
    const detailPage = read("src/app/estimates/[id]/page.tsx");
    const snapshotPage = read("src/app/estimates/[id]/snapshot/page.tsx");
    const versionPage = read("src/app/estimates/[id]/snapshot/[version]/page.tsx");
    const projectPage = read("src/app/projects/[id]/page.tsx");

    expect(listPage).toContain("await createServerSupabaseClient()");
    expect(listPage).toContain("getEstimateList(readClient)");
    for (const call of [
      "getEstimateHeaderById(id, readClient)",
      "getEstimateMeta(id, readClient)",
      "getEstimateItems(id, readClient)",
      "getEstimateCategories(id, readClient)",
      "getPaymentSchedule(id, readClient)",
    ]) {
      expect(detailPage).toContain(call);
    }
    expect(snapshotPage).toContain("getEstimateById(id, readClient)");
    expect(snapshotPage).toContain("getEstimateMeta(id, readClient)");
    expect(versionPage).toContain("getEstimateSnapshot(id, v, readClient)");
    expect(projectPage).toContain(
      "requireSupabaseOwnerOrAdminServerActionClient({ noStore: true })"
    );
    expect(projectPage).toContain("const projectSupabase = guard.client");
    expect(projectPage).not.toContain("createServerSupabaseClient({ noStore: true })");
    expect(projectPage).toContain("getEstimateList(projectSupabase)");
  });
});
