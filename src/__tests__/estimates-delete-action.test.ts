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

  function mockDeleteFlow({
    deleteData,
    deleteError = null,
    postDeleteData,
    postDeleteError = null,
  }: {
    deleteData: Array<{ id: string }> | null;
    deleteError?: { message: string; code?: string } | null;
    postDeleteData: { id: string } | null;
    postDeleteError?: { message: string; code?: string } | null;
  }) {
    const deleteSelect = vi.fn().mockResolvedValue({ data: deleteData, error: deleteError });
    const deleteEq = vi.fn(() => ({ select: deleteSelect }));
    const deleteRow = vi.fn(() => ({ eq: deleteEq }));
    const verifyMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: postDeleteData, error: postDeleteError });
    const verifyEq = vi.fn(() => ({ maybeSingle: verifyMaybeSingle }));
    const verifySelect = vi.fn(() => ({ eq: verifyEq }));
    const from = vi
      .fn()
      .mockReturnValueOnce({ delete: deleteRow })
      .mockReturnValueOnce({ select: verifySelect });
    getServerSupabaseAdminMock.mockReturnValue({ from });
    return { from, deleteRow, deleteEq, deleteSelect, verifySelect, verifyEq, verifyMaybeSingle };
  }

  it("does not report success when no estimate row was deleted", async () => {
    mockDeleteFlow({ deleteData: [], postDeleteData: null });

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
    mockDeleteFlow({ deleteData: [{ id: estimateId }], postDeleteData: null });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", estimateId);

    const result = await deleteEstimateAction(formData);

    expect(result).toMatchObject({
      ok: true,
      diagnostic: {
        estimateId,
        deletedRowCount: 1,
        deletedRowIds: [estimateId],
        postDeleteExists: false,
        postDeleteId: null,
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}/preview`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/estimates/${estimateId}/print`);
  });

  it("does not report success when post-delete verification still finds the estimate row", async () => {
    const estimateId = "22222222-2222-2222-2222-222222222222";
    mockDeleteFlow({
      deleteData: [{ id: estimateId }],
      postDeleteData: { id: estimateId },
    });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", estimateId);

    const result = await deleteEstimateAction(formData);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/still exists/i);
    expect(result.diagnostic).toMatchObject({
      estimateId,
      deletedRowCount: 1,
      deletedRowIds: [estimateId],
      postDeleteExists: true,
      postDeleteId: estimateId,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
