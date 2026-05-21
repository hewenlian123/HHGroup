import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
const getServerSupabaseAdminMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: getServerSupabaseAdminMock,
}));

describe("deleteEstimateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not report success when no estimate row was deleted", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const deleteRow = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteRow }));
    getServerSupabaseAdminMock.mockReturnValue({ from });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", "00000000-0000-0000-0000-000000000000");

    const result = await deleteEstimateAction(formData);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not deleted/i);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates list and detail surfaces after deleting an estimate", async () => {
    const estimateId = "11111111-1111-1111-1111-111111111111";
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: estimateId }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const deleteRow = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteRow }));
    getServerSupabaseAdminMock.mockReturnValue({ from });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", estimateId);

    const result = await deleteEstimateAction(formData);

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}/preview`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}/print`);
  });
});
