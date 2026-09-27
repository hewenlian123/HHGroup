import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvoice: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getInvoiceById: vi.fn(),
  getInvoiceByIdWithDerived: vi.fn(),
  getServerSupabaseAdmin: vi.fn(),
  requireSupabaseOwnerOrAdminServerActionWithClient: vi.fn(),
  revalidatePath: vi.fn(),
  updateInvoice: vi.fn(),
  strictClient: {} as object,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerActionWithClient:
    mocks.requireSupabaseOwnerOrAdminServerActionWithClient,
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  getServerSupabaseAdmin: mocks.getServerSupabaseAdmin,
}));

vi.mock("@/lib/data", () => ({
  createInvoice: mocks.createInvoice,
  deleteInvoice: vi.fn(),
  getInvoiceById: mocks.getInvoiceById,
  getInvoiceByIdWithDerived: mocks.getInvoiceByIdWithDerived,
  getInvoiceDeleteDependencies: vi.fn(),
  revertInvoiceToDraft: vi.fn(),
  unlinkInvoiceFromPaymentScheduleItem: vi.fn(),
  updateInvoice: mocks.updateInvoice,
}));

describe("invoice action strict-client wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireSupabaseOwnerOrAdminServerActionWithClient.mockResolvedValue({
      ok: true,
      client: mocks.strictClient,
    });
  });

  it("passes the strict client through draft updates without changing line amounts", async () => {
    mocks.getInvoiceById.mockResolvedValue({ projectId: "project-before" });
    mocks.updateInvoice.mockResolvedValue(true);
    const { updateInvoiceAction } = await import("@/app/financial/invoices/actions");

    await expect(
      updateInvoiceAction("invoice-1", {
        projectId: "project-after",
        clientName: "Customer One",
        issueDate: "2026-08-30",
        dueDate: "2026-09-30",
        taxPct: 7.25,
        notes: "Preserve values",
        lineItems: [{ description: "Labor", qty: 2, unitPrice: 125.5 }],
      })
    ).resolves.toEqual({ ok: true });

    expect(mocks.getInvoiceById).toHaveBeenCalledWith("invoice-1", mocks.strictClient);
    expect(mocks.updateInvoice).toHaveBeenCalledWith(
      "invoice-1",
      expect.objectContaining({
        lineItems: [{ description: "Labor", qty: 2, unitPrice: 125.5, amount: 251 }],
        taxPct: 7.25,
      }),
      mocks.strictClient
    );
  });

  it("passes the strict client through invoice duplication", async () => {
    mocks.getInvoiceById.mockResolvedValue({
      status: "Sent",
      projectId: "project-1",
      customerId: "customer-1",
      clientName: "Customer One",
      lineItems: [{ description: "Labor", qty: 2, unitPrice: 125.5, amount: 251 }],
      taxPct: 7.25,
      notes: "Original note",
    });
    mocks.createInvoice.mockResolvedValue({ id: "invoice-copy", projectId: "project-1" });
    const { duplicateInvoiceAction } = await import("@/app/financial/invoices/actions");

    await expect(duplicateInvoiceAction("invoice-1")).resolves.toEqual({
      ok: true,
      invoiceId: "invoice-copy",
    });

    expect(mocks.getInvoiceById).toHaveBeenCalledWith("invoice-1", mocks.strictClient);
    expect(mocks.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        customerId: "customer-1",
        lineItems: [{ description: "Labor", qty: 2, unitPrice: 125.5, amount: 251 }],
        taxPct: 7.25,
      }),
      mocks.strictClient
    );
  });
});
