import { beforeEach, describe, expect, it, vi } from "vitest";

const createEstimateTemplateMock = vi.fn();
const requireOwnerOrAdminMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getServerSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerActionWithClient: requireOwnerOrAdminMock,
}));
vi.mock("@/lib/estimate-templates-db", () => ({
  archiveEstimateTemplate: vi.fn(),
  createEstimateTemplate: createEstimateTemplateMock,
  createEstimateTemplateFromEstimate: vi.fn(),
  deleteEstimateTemplate: vi.fn(),
  duplicateEstimateTemplate: vi.fn(),
  updateEstimateTemplate: vi.fn(),
}));

describe("estimate template server-action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerOrAdminMock.mockResolvedValue({
      ok: false,
      error: "Owner or admin access is required.",
    });
  });

  it("blocks template creation before any database write", async () => {
    const { createEstimateTemplateAction } = await import("@/app/estimate-templates/actions");
    const formData = new FormData();
    formData.set("name", "Protected template");

    const result = await createEstimateTemplateAction(formData);

    expect(result).toEqual({ ok: false, error: "Owner or admin access is required." });
    expect(createEstimateTemplateMock).not.toHaveBeenCalled();
  });
});
