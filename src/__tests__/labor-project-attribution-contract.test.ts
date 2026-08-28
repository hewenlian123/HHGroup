import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

const MIGRATION = "supabase/migrations/20260828181552_repair_labor_entry_project_attribution.sql";

describe("labor project attribution contract", () => {
  it("restores a writable direct project with deterministic-only backfill and no RLS changes", () => {
    const sql = source(MIGRATION);

    expect(sql).toMatch(/ADD COLUMN project_id uuid/i);
    expect(sql).toMatch(/ALTER COLUMN project_id DROP EXPRESSION/i);
    expect(sql).toContain("count(DISTINCT project_id) = 1");
    for (const legacyColumn of [
      "project_am_id",
      "project_pm_id",
      "am_project_id",
      "pm_project_id",
      "ot_project_id",
    ]) {
      expect(sql).toContain(`'${legacyColumn}'`);
    }
    expect(sql).toMatch(/FOREIGN KEY \(project_id\)[\s\S]*REFERENCES public\.projects\(id\)/i);
    expect(sql).toMatch(/ON DELETE NO ACTION/i);
    expect(sql).toMatch(
      /idx_labor_entries_project_id[\s\S]*\(project_id\)[\s\S]*WHERE project_id IS NOT NULL/i
    );
    expect(sql).toContain("CREATE TRIGGER labor_entries_require_project_attribution");
    expect(sql).toContain("TG_OP = 'INSERT' AND NEW.project_id IS NULL");
    expect(sql).toContain("OLD.project_id IS NOT NULL");
    expect(sql).toContain("NEW.project_id IS NULL");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS labor_entries_project_id_required");
    expect(sql).not.toMatch(/CHECK \(project_id IS NOT NULL\)[\s\S]*NOT VALID/i);
    expect(sql).not.toMatch(/\bcreate\s+policy\b/i);
  });

  it("repairs legacy allocation RPCs to the direct project and cost contract", () => {
    const sql = source(MIGRATION);
    const allocationRpc = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.allocate_labor_cost")
    );

    expect(allocationRpc).toContain("v_entry.project_id");
    expect(allocationRpc).toContain("v_entry.cost_amount");
    expect(allocationRpc).toContain("SECURITY INVOKER");
    expect(allocationRpc).toContain("SET search_path TO pg_catalog, public");
    expect(allocationRpc).toContain("IF v_entry.cost_amount IS NULL");
    expect(allocationRpc).not.toContain("coalesce(v_entry.cost_amount, 0)");
    expect(allocationRpc).not.toContain("v_entry.project_am_id");
    expect(allocationRpc).not.toContain("v_entry.project_pm_id");
    expect(allocationRpc).toContain("CREATE OR REPLACE FUNCTION public.reverse_labor_cost");
    expect(allocationRpc).toContain("CREATE OR REPLACE FUNCTION public.reallocate_labor_cost");
    expect(allocationRpc).toContain(
      "Labor cost reallocation requires explicit previous attribution"
    );
    expect(allocationRpc).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.reallocate_labor_cost[\s\S]*?PERFORM public\.(?:reverse|allocate)_labor_cost/
    );
    expect(allocationRpc).toContain(
      "REVOKE EXECUTE ON FUNCTION public.allocate_labor_cost(uuid) FROM PUBLIC, anon"
    );
    expect(allocationRpc).toContain(
      "GRANT EXECUTE ON FUNCTION public.allocate_labor_cost(uuid) TO authenticated, service_role"
    );
  });

  it("removes project-less write retries and requires explicit project attribution", () => {
    const labor = source("src/lib/labor-db.ts");
    const dailyLabor = source("src/lib/daily-labor-db.ts");
    const api = source("src/app/api/labor/entries/route.ts");
    const testInsert = source("src/lib/labor-entry-test-insert.ts");
    const e2eSeed = source("tests/e2e-ensure-seed.ts");

    expect(labor).not.toMatch(/delete\s+copy\.project_id|payloadsNoProject/i);
    expect(labor).toContain("Project is required for labor attribution.");
    expect(dailyLabor).not.toContain("project_id missing skipped");
    expect(dailyLabor).toContain("Project is required for labor attribution.");
    expect(api).toContain("projectIdForUpdate");
    expect(api).toContain("Project is required for labor attribution.");
    expect(api).toContain("if (!current) return null");
    expect(api).toContain("Project attribution cannot be removed from a labor entry.");
    expect(testInsert).not.toMatch(/minimalAttempts|no project_\*/i);
    expect(e2eSeed).not.toContain("project_am_id");
  });

  it("keeps project profit isolated while reporting unattributed labor separately", () => {
    const profit = source("src/lib/profit-engine.ts");

    expect(profit).not.toContain("assertNoUnattributedLaborRows");
    expect(profit).toContain("getUnattributedLaborSummary");
    expect(profit).toContain("labor_entries unattributed summary");
    expect(profit).toMatch(/\.is\("project_id", null\)/);
    expect(profit).toMatch(/\.eq\("project_id", projectId\)/);
    expect(profit).toMatch(/\.in\("project_id", projectIds\)/);
  });

  it("surfaces legacy unattributed labor without presenting it as a migration error", () => {
    const page = source("src/app/labor/entries/page.tsx");
    const api = source("src/app/api/labor/entries/route.ts");

    expect(page).toContain("Unattributed / 未归类");
    expect(page).toContain("Show unattributed");
    expect(page).toContain("excluded from every individual Project profit total");
    expect(page).not.toMatch(/Run .*migration/i);
    expect(api).toContain("getUnattributedLaborSummary");
  });

  it("cleans attributed E2E labor before deleting its disposable project", () => {
    const cleanup = source("tests/e2e-cleanup-db.ts");
    const laborDelete = cleanup.indexOf(
      '.from("labor_entries").delete().in("id", projectLaborIds)'
    );
    const projectDelete = cleanup.indexOf('.from("projects").delete().in("id", projectIds)');

    expect(cleanup).toContain('.in("project_id", projectIds)');
    expect(laborDelete).toBeGreaterThan(-1);
    expect(laborDelete).toBeLessThan(projectDelete);
  });
});
