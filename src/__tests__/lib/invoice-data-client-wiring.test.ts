import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

vi.mock("@/lib/invoices-db", () => ({
  createInvoice: mocks.createInvoice,
  updateInvoice: mocks.updateInvoice,
}));

describe("invoice data strict-client wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("forwards an explicit client to invoice create and update helpers", async () => {
    const strictClient = {} as SupabaseClient;
    const createPayload = {
      projectId: "project-1",
      clientName: "Customer One",
      issueDate: "2026-08-30",
      dueDate: "2026-09-30",
      lineItems: [{ description: "Labor", qty: 2, unitPrice: 125.5, amount: 251 }],
    };
    mocks.createInvoice.mockResolvedValue({ id: "invoice-1" });
    mocks.updateInvoice.mockResolvedValue(true);
    const { createInvoice, updateInvoice } = await import("@/lib/data");

    await createInvoice(createPayload, strictClient);
    await updateInvoice("invoice-1", { notes: "Preserve values" }, strictClient);

    expect(mocks.createInvoice).toHaveBeenCalledWith(createPayload, strictClient);
    expect(mocks.updateInvoice).toHaveBeenCalledWith(
      "invoice-1",
      { notes: "Preserve values" },
      strictClient
    );
  });
});
