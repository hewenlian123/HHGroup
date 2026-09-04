import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice, InvoicePayment } from "@/lib/invoices-db";
import {
  loadARPageReadModel,
  loadProjectInvoiceReadModel,
} from "@/lib/financial/invoice-read-model";

const client = { marker: "request-client" } as unknown as SupabaseClient;

const invoices: Invoice[] = [
  {
    id: "invoice-overdue",
    invoiceNo: "INV-001",
    projectId: "project-1",
    clientName: "Client One",
    issueDate: "2026-08-01",
    dueDate: "2026-08-31",
    status: "Sent",
    lineItems: [{ description: "Work", qty: 1, unitPrice: 1_000, amount: 1_000 }],
    subtotal: 1_000,
    total: 1_000,
  },
  {
    id: "invoice-paid",
    invoiceNo: "INV-002",
    projectId: "project-1",
    clientName: "Client One",
    issueDate: "2026-09-01",
    dueDate: "2026-09-30",
    status: "Sent",
    lineItems: [{ description: "Work", qty: 1, unitPrice: 400, amount: 400 }],
    subtotal: 400,
    total: 400,
  },
  {
    id: "invoice-void",
    invoiceNo: "INV-003",
    projectId: "project-1",
    clientName: "Client One",
    issueDate: "2026-09-01",
    dueDate: "2026-09-30",
    status: "Void",
    lineItems: [],
    subtotal: 900,
    total: 900,
  },
];

const payments: InvoicePayment[] = [
  {
    id: "pay-partial",
    invoiceId: "invoice-overdue",
    date: "2026-09-02",
    amount: 250,
    method: "ACH",
    status: "Posted",
  },
  {
    id: "pay-full",
    invoiceId: "invoice-paid",
    date: "2026-09-01",
    amount: 400,
    method: "Check",
    status: "Posted",
  },
  {
    id: "pay-voided",
    invoiceId: "invoice-overdue",
    date: "2026-09-03",
    amount: 100,
    method: "Cash",
    status: "Voided",
  },
];

function loaders() {
  return {
    getInvoices: vi.fn(async (received: SupabaseClient) => {
      expect(received).toBe(client);
      return invoices;
    }),
    getInvoicePayments: vi.fn(async (received: SupabaseClient) => {
      expect(received).toBe(client);
      return payments;
    }),
    getProjects: vi.fn(async (received: SupabaseClient) => {
      expect(received).toBe(client);
      return [
        {
          id: "project-1",
          name: "Project One",
          status: "active" as const,
          budget: 1_000,
          spent: 0,
          updated: "2026-09-03",
        },
      ];
    }),
  };
}

describe("shared invoice read models", () => {
  it("builds Project Detail billing and invoice rows from one invoice/payment load", async () => {
    const deps = loaders();
    const model = await loadProjectInvoiceReadModel("project-1", client, deps);

    expect(deps.getInvoices).toHaveBeenCalledTimes(1);
    expect(deps.getInvoicePayments).toHaveBeenCalledTimes(1);
    expect(deps.getProjects).not.toHaveBeenCalled();
    expect(model.billingSummary).toEqual({
      invoicedTotal: 1_400,
      paidTotal: 650,
      arBalance: 750,
      // Preserve the legacy billing-summary behavior: the latest dated row is
      // reported even when that payment row has since been voided.
      lastPaymentDate: "2026-09-03",
    });
    expect(model.projectInvoices.map((row) => row.id)).toEqual([
      "invoice-paid",
      "invoice-overdue",
    ]);
  });

  it("builds AR summary and outstanding rows with exactly one source load each", async () => {
    const deps = loaders();
    const model = await loadARPageReadModel(client, deps, new Date("2026-09-03T12:00:00Z"));

    expect(deps.getInvoices).toHaveBeenCalledTimes(1);
    expect(deps.getInvoicePayments).toHaveBeenCalledTimes(1);
    expect(deps.getProjects).toHaveBeenCalledTimes(1);
    expect(model.summary).toEqual({ totalAR: 750, overdueAR: 750, paidThisMonth: 650 });
    expect(model.outstanding).toHaveLength(1);
    expect(model.outstanding[0]).toMatchObject({
      id: "invoice-overdue",
      paidTotal: 250,
      balanceDue: 750,
      computedStatus: "Overdue",
    });
  });

  it("preserves legitimate empty data as real zero/empty", async () => {
    const deps = loaders();
    deps.getInvoices.mockResolvedValueOnce([]);
    deps.getInvoicePayments.mockResolvedValueOnce([]);
    deps.getProjects.mockResolvedValueOnce([]);

    await expect(
      loadARPageReadModel(client, deps, new Date("2026-09-03T12:00:00Z"))
    ).resolves.toMatchObject({
      summary: { totalAR: 0, overdueAR: 0, paidThisMonth: 0 },
      outstanding: [],
      projects: [],
    });
  });

  it("propagates permission/schema/network failures instead of caching a zero", async () => {
    const deps = loaders();
    deps.getInvoicePayments.mockRejectedValueOnce(new Error("permission denied"));

    await expect(
      loadARPageReadModel(client, deps, new Date("2026-09-03T12:00:00Z"))
    ).rejects.toThrow("permission denied");
  });
});
