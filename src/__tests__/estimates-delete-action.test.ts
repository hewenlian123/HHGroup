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
    childDeleteErrors = {},
  }: {
    deleteData: Array<{ id: string }> | null;
    deleteError?: { message: string; code?: string } | null;
    postDeleteData: { id: string } | null;
    postDeleteError?: { message: string; code?: string } | null;
    childDeleteErrors?: Record<string, { message: string; code?: string }>;
  }) {
    const buildDeleteResult = (table: string) => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            abortSignal: vi
              .fn()
              .mockResolvedValue(
                table === "estimates"
                  ? { data: deleteData, error: deleteError }
                  : { data: [], error: childDeleteErrors[table] ?? null }
              ),
          })),
        })),
      })),
    });
    const buildEstimateResult = () => ({
      ...buildDeleteResult("estimates"),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          abortSignal: vi.fn(() => ({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: postDeleteData, error: postDeleteError }),
          })),
        })),
      })),
    });
    const from = vi.fn((table: string) =>
      table === "estimates" ? buildEstimateResult() : buildDeleteResult(table)
    );
    getServerSupabaseAdminMock.mockReturnValue({ from });
    return { from };
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

  it("does not delete the estimate when related row cleanup fails", async () => {
    const estimateId = "33333333-3333-3333-3333-333333333333";
    const { from } = mockDeleteFlow({
      deleteData: [{ id: estimateId }],
      postDeleteData: null,
      childDeleteErrors: {
        estimate_payment_schedule_items: { message: "permission denied", code: "42501" },
      },
    });

    const { deleteEstimateAction } = await import("@/app/estimates/actions");
    const formData = new FormData();
    formData.set("estimateId", estimateId);

    const result = await deleteEstimateAction(formData);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/permission denied/i);
    expect(from).not.toHaveBeenCalledWith("estimates");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
