import { beforeEach, describe, expect, it, vi } from "vitest";

const updateEstimateMetaWithClientMock = vi.fn();
const getServerSupabaseAdminMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/estimates/revalidate-estimate-paths", () => ({
  revalidateEstimatePaths: vi.fn(),
}));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerAction: vi.fn().mockResolvedValue({
    ok: true,
    context: {
      email: "owner@example.com",
      role: "owner",
      user: { id: "33333333-3333-4333-8333-333333333333" },
    },
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: getServerSupabaseAdminMock,
}));
vi.mock("@/lib/estimates-db", () => ({
  setEstimateStatusWithClient: vi.fn(),
  addLineItemWithClient: vi.fn(),
  updateLineItemWithClient: vi.fn(),
  duplicateLineItemWithClient: vi.fn(),
  deleteLineItemWithClient: vi.fn(),
  createCustomEstimateCategoryWithClient: vi.fn(),
  createEstimateCategoryWithExplicitCodeWithClient: vi.fn(),
  addPaymentMilestoneWithClient: vi.fn(),
  updatePaymentMilestoneWithClient: vi.fn(),
  deletePaymentMilestoneWithClient: vi.fn(),
  markPaymentMilestonePaidWithClient: vi.fn(),
  reorderPaymentScheduleWithClient: vi.fn(),
  updateEstimateMetaWithClient: updateEstimateMetaWithClientMock,
  reorderEstimateCategoriesWithClient: vi.fn(),
  reorderEstimateItemsWithClient: vi.fn(),
  moveEstimateItemsToCostCodeWithClient: vi.fn(),
  updateEstimateCategoryDisplayNameWithClient: vi.fn(),
  applyPaymentTemplateToEstimateWithClient: vi.fn(),
  computeSummary: vi.fn(),
  getEstimateItems: vi.fn(),
  getEstimateMeta: vi.fn(),
}));
vi.mock("@/lib/estimate-notes", () => ({ normalizeEstimateNoteBlocks: vi.fn() }));
vi.mock("@/lib/estimate-milestone-invoice-allocation", () => ({
  allocateTaxInclusiveMilestoneToInvoice: vi.fn(),
}));
vi.mock("@/lib/estimate-activity", () => ({
  estimateActivityActorFromAuth: vi.fn(),
  linkEstimateMilestoneInvoiceWithActivityWithClient: vi.fn(),
}));
vi.mock("@/lib/data", () => ({
  convertEstimateSnapshotToProject: vi.fn(),
  convertEstimateToProjectWithSetup: vi.fn(),
  createPaymentTemplate: vi.fn(),
}));

const ESTIMATE_ID = "11111111-1111-4111-8111-111111111111";
const db = { from: vi.fn() };

function formWith(fields: Record<string, string | undefined>): FormData {
  const form = new FormData();
  form.set("estimateId", ESTIMATE_ID);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.set(key, value);
  }
  return form;
}

describe("saveEstimateMetaInlineAction financial inputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSupabaseAdminMock.mockReturnValue(db);
    updateEstimateMetaWithClientMock.mockResolvedValue(true);
  });

  it("rejects malformed tax before any database update", async () => {
    const { saveEstimateMetaInlineAction } = await import("@/app/estimates/[id]/actions");

    await expect(saveEstimateMetaInlineAction(formWith({ tax: "not-a-number" }))).resolves.toEqual({
      ok: false,
      error: "Tax must be a finite number.",
    });
    expect(updateEstimateMetaWithClientMock).not.toHaveBeenCalled();
  });

  it("rejects malformed discount before any database update", async () => {
    const { saveEstimateMetaInlineAction } = await import("@/app/estimates/[id]/actions");

    await expect(
      saveEstimateMetaInlineAction(formWith({ discount: "not-a-number" }))
    ).resolves.toEqual({
      ok: false,
      error: "Discount must be a finite number.",
    });
    expect(updateEstimateMetaWithClientMock).not.toHaveBeenCalled();
  });

  it("makes legacy malformed tax validation an explicit pre-database failure", async () => {
    const { saveEstimateMetaAction } = await import("@/app/estimates/[id]/actions");

    await expect(saveEstimateMetaAction(formWith({ tax: "not-a-number" }))).rejects.toThrow(
      "Tax must be a finite number."
    );
    expect(updateEstimateMetaWithClientMock).not.toHaveBeenCalled();
  });

  it.each(["tax", "discount"] as const)(
    "persists a string %s zero as numeric zero",
    async (field) => {
      const { saveEstimateMetaInlineAction } = await import("@/app/estimates/[id]/actions");

      await expect(saveEstimateMetaInlineAction(formWith({ [field]: "0" }))).resolves.toEqual({
        ok: true,
      });
      expect(updateEstimateMetaWithClientMock).toHaveBeenCalledWith(db, ESTIMATE_ID, {
        [field]: 0,
      });
    }
  );

  it("omits missing financial inputs from the persistence payload", async () => {
    const { saveEstimateMetaInlineAction } = await import("@/app/estimates/[id]/actions");

    await expect(saveEstimateMetaInlineAction(formWith({}))).resolves.toEqual({ ok: true });
    expect(updateEstimateMetaWithClientMock).toHaveBeenCalledWith(db, ESTIMATE_ID, {});
  });

  it.each([
    ["tax", ""],
    ["tax", "   "],
    ["discount", ""],
    ["discount", "   "],
  ] as const)("omits a blank %s input from the persistence payload", async (field, value) => {
    const { saveEstimateMetaInlineAction } = await import("@/app/estimates/[id]/actions");

    await expect(saveEstimateMetaInlineAction(formWith({ [field]: value }))).resolves.toEqual({
      ok: true,
    });
    expect(updateEstimateMetaWithClientMock).toHaveBeenCalledWith(db, ESTIMATE_ID, {});
  });
});
