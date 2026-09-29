import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  guard: vi.fn(),
  companyAdmin: vi.fn(),
  batch: vi.fn(),
  canonical: vi.fn(),
  cost: vi.fn(),
  invoices: vi.fn(),
  getProjects: vi.fn(),
  getProjectById: vi.fn(),
  getDocumentsByProject: vi.fn(),
}));
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import { normalizeWorkspaceTab } from "@/lib/navigation/project-workspace";
import { authorizedAppRole } from "@/lib/auth-role";
const nodeRequire = createRequire(import.meta.url);
function loadPage(path: string) {
  const output = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const emptyReads = new Proxy(mocked, {
    get(target, key) {
      return key in target ? target[key as keyof typeof target] : async () => [];
    },
  });
  const modules: Record<string, unknown> = {
    "@/lib/auth-boundary": {
      requireOrganizationServerActionClient: mocked.guard,
      requireSupabaseOwnerOrAdminServerActionClient: mocked.guard,
    },
    "@/lib/auth-role": { authorizedAppRole },
    "@/lib/organization-membership": { hasCompanyAdministratorMembership: mocked.companyAdmin },
    "@/lib/supabase-server": { createServerSupabaseClient: async () => client },
    "@/lib/profit-engine": {
      getCanonicalProjectProfitBatch: mocked.batch,
      getCanonicalProjectProfit: mocked.canonical,
    },
    "@/lib/project-cost-dashboard": { getProjectCostDashboard: mocked.cost },
    "@/lib/financial/invoice-read-model": { loadProjectInvoiceReadModel: mocked.invoices },
    "@/lib/payments-received-db": { listUnappliedPaymentsForProject: async () => [] },
    "@/lib/data": emptyReads,
    "@/lib/ap-bills-db": { getApBillsByProject: async () => [] },
    "@/lib/daily-labor-db": { getLaborEntriesWithJoins: async () => [] },
    "./projects-list-client": { ProjectsListClient: "projects-list" },
    "./project-detail-tabs-client": { ProjectDetailTabsClient: "project-detail" },
    "@/components/server-data-load-fallback": { ServerDataLoadFallback: "fallback" },
    "@/lib/server-load-warning": {
      logServerPageDataError: () => {},
      serverDataLoadWarning: () => "Data unavailable",
    },
    "@/lib/performance/server-timing": { emitRscTiming: () => {} },
    "@/lib/navigation/project-workspace": { normalizeWorkspaceTab },
    "next/navigation": {
      notFound: () => {
        throw new Error("NOT_FOUND");
      },
    },
  };
  const exported: {
    default?: (props: unknown) => Promise<{
      props: Record<string, unknown> & { children: { props: Record<string, unknown> } };
    }>;
  } = {};
  new Function("require", "exports", output)(
    (name: string) => modules[name] ?? nodeRequire(name),
    exported
  );
  return exported.default!;
}
const ProjectsPage = loadPage("src/app/projects/page.tsx");
const ProjectDetailPage = loadPage("src/app/projects/[id]/page.tsx");

const project = {
  id: "project-a",
  name: "Authorized project",
  status: "active",
  budget: 100,
  client: null,
};
const client = {
  from: () => ({
    select: async () => ({ data: [{ id: "project-a", organization_id: "org-a" }], error: null }),
  }),
};
function guard(role = "owner") {
  return {
    ok: true,
    client,
    context: {
      organizationRole: role,
      user: { app_metadata: { role } },
      memberships: [{ organization_id: "org-a", role, status: "active" }],
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.companyAdmin.mockResolvedValue(true);
  mocked.guard.mockResolvedValue(guard());
  mocked.getProjects.mockResolvedValue([project]);
  mocked.getProjectById.mockResolvedValue(project);
  mocked.getDocumentsByProject.mockResolvedValue([{ id: "doc-a", title: "Authorized document" }]);
  mocked.batch.mockResolvedValue(new Map());
  mocked.canonical.mockResolvedValue({ revenue: 100, profit: 60, laborCost: 40, actualCost: 40 });
  mocked.cost.mockResolvedValue({
    revenue: 100,
    profit: 60,
    margin: 0.6,
    spentTotal: 40,
    recentDoneRows: [],
    doneCostRows: [],
    breakdown: {},
    alerts: {},
  });
  mocked.invoices.mockResolvedValue({
    billingSummary: { invoicedTotal: 100, paidTotal: 50, arBalance: 50, lastPaymentDate: null },
    projectInvoices: [],
  });
});

describe("organization project reads survive unavailable financial data", () => {
  it("retains authorized list rows with null financial values when profit reads fail", async () => {
    mocked.batch.mockRejectedValue(new Error("Finance denied"));
    const page = await ProjectsPage({});
    expect(page.props.children.props.rows).toMatchObject([
      {
        id: "project-a",
        revenue: null,
        actualCost: null,
        profit: null,
        financialSource: "unavailable",
      },
    ]);
    expect(page.props.children.props.dataLoadWarning).toBeNull();
  });
  it("does not query finance for assistant list membership", async () => {
    mocked.guard.mockResolvedValue(guard("assistant"));
    const page = await ProjectsPage({});
    expect(page.props.children.props.rows).toMatchObject([
      { id: "project-a", canViewFinancials: false, revenue: null },
    ]);
    expect(mocked.batch).not.toHaveBeenCalled();
  });
  it("admits scoped assistant document reads without finance or billing queries", async () => {
    mocked.guard.mockResolvedValue(guard("assistant"));
    const page = await ProjectDetailPage({
      params: Promise.resolve({ id: "project-a" }),
      searchParams: Promise.resolve({ tab: "documents" }),
    });
    expect(mocked.guard).toHaveBeenCalledWith({ projectId: "project-a", noStore: true });
    expect(page.props.documents).toEqual([{ id: "doc-a", title: "Authorized document" }]);
    expect(page.props.billingSummary).toBeNull();
    expect(page.props.projectCost).toBeNull();
    expect(mocked.canonical).not.toHaveBeenCalled();
    expect(mocked.invoices).not.toHaveBeenCalled();
  });
  for (const failure of ["canonical", "invoices"] as const)
    it(`keeps owner documents available when ${failure} fails`, async () => {
      mocked[failure].mockRejectedValue(new Error("Unavailable"));
      const page = await ProjectDetailPage({
        params: Promise.resolve({ id: "project-a" }),
        searchParams: Promise.resolve({ tab: "documents" }),
      });
      expect(page.props.documents).toEqual([{ id: "doc-a", title: "Authorized document" }]);
      expect(page.props.financialDataWarning).toBeTruthy();
    });
  it("preserves the successful owner financial summary", async () => {
    const page = await ProjectDetailPage({
      params: Promise.resolve({ id: "project-a" }),
      searchParams: Promise.resolve({ tab: "documents" }),
    });
    expect(page.props.financialSummary).toEqual({
      budget: 100,
      revenue: 100,
      spent: 40,
      profit: 60,
      marginPct: 60,
      collected: 50,
      outstanding: 50,
      cashflow: 10,
    });
    expect(page.props.financialDataWarning).toBeNull();
  });
  it("does not apply another organization's owner role to an assistant project", async () => {
    const mixed = guard();
    mixed.context.memberships = [
      { organization_id: "org-a", role: "assistant", status: "active" },
      { organization_id: "org-b", role: "owner", status: "active" },
    ];
    mocked.guard.mockResolvedValue(mixed);
    const page = await ProjectsPage({});
    expect(page.props.children.props.rows).toMatchObject([
      { id: "project-a", canViewFinancials: false, canManage: false },
    ]);
    expect(mocked.batch).not.toHaveBeenCalled();
  });
  it("rejects inaccessible projects before reading their business data", async () => {
    mocked.guard.mockResolvedValue({ ok: false, status: 404, error: "Not found" });
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ id: "other-project" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(mocked.getProjectById).not.toHaveBeenCalled();
  });
});
