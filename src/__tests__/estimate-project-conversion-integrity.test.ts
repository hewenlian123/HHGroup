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
  const db = { rpc: vi.fn() } as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not mark the estimate Converted before the project exists", async () => {
    createProjectMock.mockRejectedValue(new Error("project insert failed"));
    const { convertEstimateToProjectWithSetup } = await import("@/lib/data");

    await expect(
      convertEstimateToProjectWithSetup("estimate-1", { projectName: "HH Residence" }, actor, db)
    ).rejects.toThrow("project insert failed");

    expect(setEstimateStatusMock).not.toHaveBeenCalled();
  });

  it("uses the authenticated server client for every conversion read", async () => {
    createProjectMock.mockResolvedValue({ id: "project-1" });
    setEstimateStatusMock.mockResolvedValue(true);
    const { convertEstimateToProjectWithSetup } = await import("@/lib/data");

    await convertEstimateToProjectWithSetup(
      "estimate-1",
      { projectName: "HH Residence" },
      actor,
      db
    );

    expect(getProjectBySourceEstimateIdMock).toHaveBeenCalledWith("estimate-1", db);
    expect(getEstimateByIdMock).toHaveBeenCalledWith("estimate-1", db);
    expect(getEstimateMetaMock).toHaveBeenCalledWith("estimate-1", db);
    expect(getEstimateItemsMock).toHaveBeenCalledWith("estimate-1", db);
    expect(createProjectMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ customerId: "44444444-4444-4444-8444-444444444444" })
    );
  });

  it("removes the new project when the final status transition fails", async () => {
    createProjectMock.mockResolvedValue({ id: "project-1" });
    setEstimateStatusMock.mockResolvedValue(false);
    deleteProjectMock.mockResolvedValue(true);
    const { convertEstimateToProjectWithSetup } = await import("@/lib/data");

    const result = await convertEstimateToProjectWithSetup(
      "estimate-1",
      { projectName: "HH Residence" },
      actor,
      db
    );

    expect(result).toBeNull();
    expect(createProjectMock).toHaveBeenCalledTimes(1);
    expect(deleteProjectMock).toHaveBeenCalledWith(db, "project-1");
  });
});
