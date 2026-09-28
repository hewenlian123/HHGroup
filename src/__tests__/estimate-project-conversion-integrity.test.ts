import { beforeEach, describe, expect, it, vi } from "vitest";

const setEstimateStatusMock = vi.fn();
const createProjectMock = vi.fn();
const deleteProjectMock = vi.fn();
const getProjectBySourceEstimateIdMock = vi.fn().mockResolvedValue(null);
const getEstimateByIdMock = vi.fn().mockResolvedValue({
  id: "estimate-1",
  customerId: "44444444-4444-4444-8444-444444444444",
  number: "EST-0001",
  status: "Approved",
  client: "Owner",
  project: "HH Residence",
});
const getEstimateMetaMock = vi.fn().mockResolvedValue({
  client: { name: "Owner" },
  project: { name: "HH Residence" },
  tax: 0,
  discount: 0,
});
const getEstimateItemsMock = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/estimates-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/estimates-db")>();
  return {
    ...actual,
    getEstimateById: getEstimateByIdMock,
    getEstimateMeta: getEstimateMetaMock,
    getEstimateItems: getEstimateItemsMock,
    computeSummary: vi.fn().mockReturnValue({
      total: 1000,
      subtotal: 800,
      materialCost: 300,
      laborCost: 300,
      subcontractorCost: 200,
    }),
    setEstimateStatusWithClient: setEstimateStatusMock,
  };
});

vi.mock("@/lib/projects-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects-db")>();
  return {
    ...actual,
    getProjectBySourceEstimateId: getProjectBySourceEstimateIdMock,
    createProjectWithClient: createProjectMock,
    deleteProjectWithClient: deleteProjectMock,
  };
});

describe("estimate to project conversion integrity", () => {
  const actor = {
    userId: "33333333-3333-4333-8333-333333333333",
    label: "owner@example.com",
  };
  const rpcMock = vi.fn();
  const db = { rpc: rpcMock } as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits project and lifecycle through one transaction with unchanged amounts", async () => {
    rpcMock.mockResolvedValue({ data: { projectId: "project-1" }, error: null });
    const { convertEstimateToProjectWithSetup } = await import("@/lib/data");
    const result = await convertEstimateToProjectWithSetup(
      "estimate-1",
      { projectName: "HH Residence" },
      actor,
      db
    );
    expect(result?.projectId).toBe("project-1");
    expect(rpcMock).toHaveBeenCalledWith("convert_estimate_to_project_atomic", {
      p_estimate_id: "estimate-1",
      p_project: expect.objectContaining({
        name: "HH Residence",
        budget: 1000,
        snapshotRevenue: 1000,
        snapshotBudgetCost: 800,
        snapshotBreakdown: { materials: 300, labor: 300, vendor: 200, other: 0 },
      }),
      p_actor_user_id: actor.userId,
      p_actor_label: actor.label,
    });
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(setEstimateStatusMock).not.toHaveBeenCalled();
    expect(deleteProjectMock).not.toHaveBeenCalled();
    expect(getEstimateByIdMock).toHaveBeenCalledWith("estimate-1", db);
    expect(getEstimateMetaMock).toHaveBeenCalledWith("estimate-1", db);
    expect(getEstimateItemsMock).toHaveBeenCalledWith("estimate-1", db);
  });

  it("reports a transaction failure without attempting a destructive compensation", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "activity write failed" } });
    const { convertEstimateToProjectWithSetup } = await import("@/lib/data");
    await expect(
      convertEstimateToProjectWithSetup("estimate-1", { projectName: "HH Residence" }, actor, db)
    ).rejects.toThrow("activity write failed");
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(deleteProjectMock).not.toHaveBeenCalled();
  });

  it("returns the committed project on a duplicate or response-loss retry", async () => {
    rpcMock.mockResolvedValueOnce({ data: { projectId: "project-1" }, error: null });
    getProjectBySourceEstimateIdMock.mockResolvedValueOnce({
      id: "project-1",
      sourceEstimateId: "estimate-1",
      budget: 1000,
      snapshotRevenue: 1000,
      snapshotBudgetCost: 800,
    });
    const { convertEstimateToProjectWithSetup } = await import("@/lib/data");
    const result = await convertEstimateToProjectWithSetup(
      "estimate-1",
      { projectName: "HH Residence" },
      actor,
      db
    );
    expect(result?.projectId).toBe("project-1");
    expect(rpcMock).toHaveBeenCalledWith("convert_estimate_to_project_atomic", {
      p_estimate_id: "estimate-1",
      p_project: {},
      p_actor_user_id: actor.userId,
      p_actor_label: actor.label,
    });
    expect(createProjectMock).not.toHaveBeenCalled();
  });
  it("does not report a legacy partial conversion as success", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Estimate requires reconciliation" },
    });
    getProjectBySourceEstimateIdMock.mockResolvedValueOnce({
      id: "project-1",
      sourceEstimateId: "estimate-1",
      budget: 1000,
    });
    const { convertEstimateToProjectWithSetup } = await import("@/lib/data");
    await expect(
      convertEstimateToProjectWithSetup("estimate-1", { projectName: "HH Residence" }, actor, db)
    ).rejects.toThrow("reconciliation");
  });
});
