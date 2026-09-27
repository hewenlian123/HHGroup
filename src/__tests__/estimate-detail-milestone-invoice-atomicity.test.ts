import { beforeEach, describe, expect, it, vi } from "vitest";

const createEstimateMilestoneInvoiceAtomicWithClientMock = vi.fn();
const directMutationMock = vi.fn();
const getServerSupabaseAdminMock = vi.fn();
const linkEstimateMilestoneInvoiceWithActivityWithClientMock = vi.fn();

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
  updateEstimateMetaWithClient: vi.fn(),
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
  allocateTaxInclusiveMilestoneToInvoice: vi.fn().mockReturnValue({
    subtotal: 476.19,
    taxPct: 5,
    taxAmount: 23.81,
    total: 500,
  }),
}));
vi.mock("@/lib/estimate-activity", () => ({
  estimateActivityActorFromAuth: vi.fn().mockReturnValue({
    userId: "33333333-3333-4333-8333-333333333333",
    label: "owner@example.com",
  }),
  linkEstimateMilestoneInvoiceWithActivityWithClient: (...args: unknown[]) =>
    linkEstimateMilestoneInvoiceWithActivityWithClientMock(...args),
}));
vi.mock("@/lib/invoices-db", () => ({
  createEstimateMilestoneInvoiceAtomicWithClient: (...args: unknown[]) =>
    createEstimateMilestoneInvoiceAtomicWithClientMock(...args),
}));
vi.mock("@/lib/data", () => ({
  convertEstimateSnapshotToProject: vi.fn(),
  convertEstimateToProjectWithSetup: vi.fn(),
  createPaymentTemplate: vi.fn(),
}));

function queryResult(data: unknown, extra: Record<string, unknown> = {}) {
  const result = { data, error: null, ...extra };
  const query: Record<string, unknown> & PromiseLike<typeof result> = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe("Estimate detail milestone Invoice atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEstimateMilestoneInvoiceAtomicWithClientMock.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      reused: false,
      linked: true,
    });
    directMutationMock.mockImplementation(() => {
      throw new Error("milestone Invoice action must not issue direct table writes");
    });

    const rows: Record<string, unknown> = {
      estimates: {
        id: "11111111-1111-4111-8111-111111111111",
        number: "EST-0001",
        client: "Owner",
        project: "HH Residence",
        customer_id: "22222222-2222-4222-8222-222222222222",
        status: "Approved",
      },
      estimate_meta: {
        client_name: "Owner",
        client_email: "owner@example.com",
        project_name: "HH Residence",
        tax: 5,
        discount: 0,
      },
      estimate_items: [{ qty: 1, unit_cost: 500 }],
      estimate_payment_schedule_items: {
        id: "55555555-5555-4555-8555-555555555555",
        estimate_id: "11111111-1111-4111-8111-111111111111",
        title: "Deposit",
        description: "Initial payment",
        amount: 500,
        due_date: "2026-09-30",
        status: "draft",
        invoice_id: null,
      },
      projects: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: "HH Residence",
          customer_id: "22222222-2222-4222-8222-222222222222",
          client: "Owner",
          client_name: "Owner",
        },
      ],
    };

    const db = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => queryResult(rows[table], table === "invoices" ? { count: 0 } : {})),
        insert: directMutationMock,
        delete: directMutationMock,
        update: directMutationMock,
      })),
    };
    getServerSupabaseAdminMock.mockReturnValue(db);
  });

  it("uses the single Invoice/milestone RPC and never performs cleanup deletes", async () => {
    const { createInvoiceFromPaymentScheduleItemAction } =
      await import("@/app/estimates/[id]/actions");

    await expect(
      createInvoiceFromPaymentScheduleItemAction(
        "11111111-1111-4111-8111-111111111111",
        "55555555-5555-4555-8555-555555555555"
      )
    ).resolves.toEqual({
      ok: true,
      invoiceId: "44444444-4444-4444-8444-444444444444",
    });

    expect(createEstimateMilestoneInvoiceAtomicWithClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          "invoice-milestone:11111111-1111-4111-8111-111111111111:55555555-5555-4555-8555-555555555555",
        projectId: "77777777-7777-4777-8777-777777777777",
        customerId: "22222222-2222-4222-8222-222222222222",
        taxPct: 5,
        estimateId: "11111111-1111-4111-8111-111111111111",
        scheduleItemId: "55555555-5555-4555-8555-555555555555",
        lineItems: [
          expect.objectContaining({
            description: "Payment Schedule - Deposit",
            qty: 1,
            unitPrice: 476.19,
          }),
        ],
      }),
      expect.anything()
    );
    expect(linkEstimateMilestoneInvoiceWithActivityWithClientMock).not.toHaveBeenCalled();
    expect(directMutationMock).not.toHaveBeenCalled();
  });

  it("retries an ambiguous RPC response without issuing any compensating delete", async () => {
    createEstimateMilestoneInvoiceAtomicWithClientMock.mockRejectedValueOnce(
      new Error("atomic response lost")
    );
    const { createInvoiceFromPaymentScheduleItemAction } =
      await import("@/app/estimates/[id]/actions");

    const first = await createInvoiceFromPaymentScheduleItemAction(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555"
    );
    const retry = await createInvoiceFromPaymentScheduleItemAction(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555"
    );

    expect(first).toEqual({ ok: false, error: "atomic response lost" });
    expect(retry).toEqual({
      ok: true,
      invoiceId: "44444444-4444-4444-8444-444444444444",
    });
    expect(createEstimateMilestoneInvoiceAtomicWithClientMock).toHaveBeenCalledTimes(2);
    expect(linkEstimateMilestoneInvoiceWithActivityWithClientMock).not.toHaveBeenCalled();
    expect(directMutationMock).not.toHaveBeenCalled();
  });
});
