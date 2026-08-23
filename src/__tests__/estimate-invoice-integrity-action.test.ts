import { beforeEach, describe, expect, it, vi } from "vitest";

const invoiceInsertMock = vi.fn();
const getEstimateInvoicePrefillMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerActionWithClient: vi.fn().mockResolvedValue({
    ok: true,
    context: {
      email: "owner@example.com",
      role: "owner",
      user: { id: "33333333-3333-4333-8333-333333333333" },
    },
    client: {
      from: (table: string) => {
        if (table !== "invoices") throw new Error(`unexpected write to ${table}`);
        return {
          insert: invoiceInsertMock,
        };
      },
    },
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
  getServerSupabaseAdmin: vi.fn(),
}));
vi.mock("@/app/financial/invoices/new/estimate-prefill", () => ({
  getEstimateInvoicePrefill: getEstimateInvoicePrefillMock,
}));

describe("estimate milestone invoice integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceInsertMock.mockImplementation(() => {
      throw new Error("invoice insert should not run");
    });
    getEstimateInvoicePrefillMock.mockResolvedValue({
      ok: true,
      prefill: {
        sourceEstimateId: "estimate-1",
        paymentScheduleItemId: "milestone-1",
        estimateNumber: "EST-0001",
        projectId: "project-1",
        projectName: "HH Residence",
        customerId: "customer-1",
        customerName: "Owner",
        dueDate: "2026-09-01",
        milestoneTitle: "Deposit",
        milestoneDescription: "",
        amount: 500,
        invoiceSubtotal: 476.19,
        invoiceTaxPct: 5,
        invoiceTaxAmount: 23.81,
        invoiceTotal: 500,
        notes: "",
      },
    });
  });

  it("rejects a client-edited subtotal that differs from the authoritative milestone", async () => {
    const { createInvoiceDraftAction } = await import("@/app/financial/invoices/new/actions");

    const result = await createInvoiceDraftAction({
      invoiceNo: "INV-TEST",
      projectId: "project-1",
      customerId: "customer-1",
      clientName: "Owner",
      issueDate: "2026-08-21",
      dueDate: "2026-09-01",
      sourceEstimateId: "estimate-1",
      paymentScheduleItemId: "milestone-1",
      taxPct: 5,
      lineItems: [{ description: "Changed deposit", qty: 1, unitPrice: 400 }],
    });

    expect(result).toEqual({
      ok: false,
      error: "Invoice financial breakdown must match the authoritative $500.00 milestone total.",
    });
    expect(invoiceInsertMock).not.toHaveBeenCalled();
  });

  it("rejects a client-edited tax rate even when the milestone identity is valid", async () => {
    const { createInvoiceDraftAction } = await import("@/app/financial/invoices/new/actions");

    const result = await createInvoiceDraftAction({
      invoiceNo: "INV-TEST",
      projectId: "project-1",
      customerId: "customer-1",
      clientName: "Owner",
      issueDate: "2026-08-21",
      dueDate: "2026-09-01",
      sourceEstimateId: "estimate-1",
      paymentScheduleItemId: "milestone-1",
      taxPct: 6,
      lineItems: [{ description: "Deposit", qty: 1, unitPrice: 476.19 }],
    });

    expect(result).toEqual({
      ok: false,
      error: "Invoice financial breakdown must match the authoritative $500.00 milestone total.",
    });
    expect(invoiceInsertMock).not.toHaveBeenCalled();
  });

  it("returns the existing linked invoice without creating a duplicate", async () => {
    getEstimateInvoicePrefillMock.mockResolvedValueOnce({
      ok: false,
      error: "This payment milestone already has an invoice.",
      existingInvoiceId: "invoice-existing",
    });
    const { createInvoiceDraftAction } = await import("@/app/financial/invoices/new/actions");

    const result = await createInvoiceDraftAction({
      projectId: "project-1",
      customerId: "customer-1",
      clientName: "Owner",
      issueDate: "2026-08-21",
      dueDate: "2026-09-01",
      sourceEstimateId: "estimate-1",
      paymentScheduleItemId: "milestone-1",
      lineItems: [{ description: "Deposit", qty: 1, unitPrice: 500 }],
    });

    expect(result).toEqual({ ok: true, invoiceId: "invoice-existing" });
    expect(invoiceInsertMock).not.toHaveBeenCalled();
  });
});
