import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const source = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("Project Detail production schema contract", () => {
  it("reads only the canonical closeout tables", () => {
    const closeout = source("src/lib/project-closeout-db.ts");
    const readOnlySection = closeout
      .replace(
        /export async function upsertCloseoutPunch[\s\S]*?(?=export async function getCloseoutWarranty)/,
        ""
      )
      .replace(
        /export async function upsertCloseoutWarranty[\s\S]*?(?=export async function getCloseoutCompletion)/,
        ""
      )
      .replace(/export async function upsertCloseoutCompletion[\s\S]*$/, "");

    expect(readOnlySection).toContain('.from("final_punch_lists")');
    expect(readOnlySection).toContain('.from("final_punch_list_items")');
    expect(readOnlySection).toContain('.from("warranties")');
    expect(readOnlySection).toContain('.from("completion_certificates")');
    expect(readOnlySection).not.toMatch(
      /\.from\("project_closeout_(?:punch|warranty|completion)"\)/
    );
  });

  it("does not probe optional worker columns before using the production row shape", () => {
    const workers = source("src/lib/workers-db.ts");

    expect(workers).toMatch(/getWorkers[\s\S]*?\.from\("workers"\)\.select\("\*"\)/);
  });

  it("loads the Workers page through one authenticated client without an empty-result retry", () => {
    const page = source("src/app/workers/page.tsx");

    expect(page).toContain("requireSupabaseOwnerOrAdminServerActionClient");
    expect(page).toContain("getWorkers(guard.client)");
    expect(page).toContain("getWorkerPaymentsWithClient(guard.client");
    expect(page).not.toContain("getServerSupabaseInternal");
    expect(page).not.toContain("getLaborWorkersFlat");
  });

  it("keeps Project Detail tab reads on the verified request client and fail-closed", () => {
    const route = source("src/app/api/projects/[id]/tab/route.ts");

    expect(route).toContain("getDocumentsByProject(id, supabase)");
    expect(route).toContain("getActivityLogsByProject(id, 100, supabase)");
    expect(route).toContain("getSelectionsByProject(id, supabase)");
    expect(route).toContain("getMaterialCatalog(supabase)");
    expect(route).toContain("getCloseoutPunch(id, supabase)");
    expect(route).toContain("getCloseoutWarranty(id, supabase)");
    expect(route).toContain("getCloseoutCompletion(id, supabase)");
    expect(route).not.toMatch(/getCloseout(?:Punch|Warranty|Completion)\(id\)\.catch/);
  });

  it("loads only the URL-selected workspace data and keeps tab navigation URL-backed", () => {
    const page = source("src/app/projects/[id]/page.tsx");
    const client = source("src/app/projects/[id]/project-detail-tabs-client.tsx");

    expect(page).toContain("const workspaceTab = normalizeWorkspaceTab(tab);");
    expect(page).toContain("switch (workspaceTab)");
    expect(page).not.toContain("const workspaceResults = await Promise.all([");
    expect(client).toContain("usePathname");
    expect(client).toContain("useSearchParams");
    expect(client).toContain("router.replace(");
    expect(client).toContain("loadedWorkspaceTab !== tab");
  });
});
