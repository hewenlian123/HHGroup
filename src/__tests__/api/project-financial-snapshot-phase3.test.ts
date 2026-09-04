import { beforeEach, describe, expect, it, vi } from "vitest";

const requestClient = { marker: "verified-request-client" };
const guardMock = vi.fn();
const snapshotMock = vi.fn();
const comparisonMock = vi.fn();

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminRequestClient: guardMock,
}));

vi.mock("@/lib/financial/project-financial-snapshot-db", () => ({
  getProjectFinancialSnapshot: snapshotMock,
  getProjectFinancialSnapshotComparison: comparisonMock,
}));

const snapshot = {
  projectId: "project-1",
  contractValue: 1_000,
  approvedChangeOrders: 0,
  revisedContractValue: 1_000,
  billedAmount: 600,
  paidAmount: 250,
  openAR: 350,
  actualCost: 400,
  expenseCost: 100,
  laborCost: 200,
  reimbursementCost: 0,
  subcontractCost: 75,
  commissionCost: 25,
  apCost: 0,
  grossProfit: 600,
  grossMargin: 0.6,
  cashCollected: 250,
  cashOut: 0,
  cashPosition: 250,
  warnings: [],
  diagnostics: {},
};

describe("project financial snapshot Phase 3 route", () => {
  beforeEach(() => {
    vi.resetModules();
    guardMock.mockReset();
    snapshotMock.mockReset();
    comparisonMock.mockReset();
    guardMock.mockResolvedValue({ ok: true, client: requestClient });
    snapshotMock.mockResolvedValue(snapshot);
    comparisonMock.mockResolvedValue({
      projectId: "project-1",
      oldCanonicalProfit: { actualCost: 400 },
      oldProjectCostDashboard: { spentTotal: 400 },
      newSnapshot: snapshot,
      warnings: [],
      diagnostics: {},
      differences: [],
    });
  });

  it("uses the verified request client and skips legacy comparison in normal UI mode", async () => {
    const { GET } = await import("@/app/api/projects/[id]/financial-snapshot/route");
    const response = await GET(
      new Request("http://localhost/api/projects/project-1/financial-snapshot"),
      {
        params: Promise.resolve({ id: "project-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Server-Timing")).toMatch(
      /hh_auth;dur=\d+\.\d, hh_server_data;dur=\d+\.\d, hh_handler_total;dur=\d+\.\d/
    );
    expect(snapshotMock).toHaveBeenCalledTimes(1);
    expect(snapshotMock).toHaveBeenCalledWith("project-1", requestClient);
    expect(comparisonMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      ok: true,
      comparison: {
        oldCanonicalProfit: null,
        oldProjectCostDashboard: null,
        newSnapshot: snapshot,
      },
    });
  });

  it("runs the legacy comparison only for the explicit debug mode and keeps the same client", async () => {
    const { GET } = await import("@/app/api/projects/[id]/financial-snapshot/route");
    const response = await GET(
      new Request("http://localhost/api/projects/project-1/financial-snapshot?debugFinancial=1"),
      { params: Promise.resolve({ id: "project-1" }) }
    );

    expect(response.status).toBe(200);
    expect(comparisonMock).toHaveBeenCalledTimes(1);
    expect(comparisonMock).toHaveBeenCalledWith("project-1", requestClient);
    expect(snapshotMock).not.toHaveBeenCalled();
  });

  it("returns a non-success status for a missing project", async () => {
    snapshotMock.mockRejectedValueOnce(new Error("Project not found."));
    const { GET } = await import("@/app/api/projects/[id]/financial-snapshot/route");
    const response = await GET(
      new Request("http://localhost/api/projects/missing/financial-snapshot"),
      {
        params: Promise.resolve({ id: "missing" }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("fails closed when a required financial source is unavailable", async () => {
    snapshotMock.mockRejectedValueOnce(new Error("invoice_payments unavailable"));
    const { GET } = await import("@/app/api/projects/[id]/financial-snapshot/route");
    const response = await GET(
      new Request("http://localhost/api/projects/project-1/financial-snapshot"),
      {
        params: Promise.resolve({ id: "project-1" }),
      }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});
