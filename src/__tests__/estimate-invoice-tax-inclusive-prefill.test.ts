import { describe, expect, it } from "vitest";

import { getEstimateInvoicePrefill } from "@/app/financial/invoices/new/estimate-prefill";

type Row = Record<string, unknown>;

function fakeClient(input: {
  estimateSubtotal: number;
  estimateTax: number;
  estimateDiscount: number;
  milestones: Array<{ id: string; amount: number }>;
}) {
  const tables: Record<string, Row[]> = {
    estimates: [
      {
        id: "estimate-1",
        number: "EST-0001",
        client: "Owner",
        project: "HH Residence",
        customer_id: "customer-1",
        status: "Approved",
      },
    ],
    estimate_meta: [
      {
        estimate_id: "estimate-1",
        client_name: "Owner",
        client_email: "owner@example.com",
        project_name: "HH Residence",
        tax: input.estimateTax,
        discount: input.estimateDiscount,
      },
    ],
    estimate_items: [
      {
        id: "estimate-item-1",
        estimate_id: "estimate-1",
        qty: 1,
        unit_cost: input.estimateSubtotal,
      },
    ],
    estimate_payment_schedule_items: input.milestones.map((milestone) => ({
      ...milestone,
      estimate_id: "estimate-1",
      title: `Milestone ${milestone.id}`,
      description: "",
      due_date: "2026-09-01",
      invoice_id: null,
      status: "draft",
    })),
    projects: [
      {
        id: "project-1",
        name: "HH Residence",
        source_estimate_id: "estimate-1",
        customer_id: "customer-1",
        client: "Owner",
        client_name: "Owner",
      },
    ],
  };

  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const filtered = () =>
        (tables[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: filtered()[0] ?? null, error: null });
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve({ data: filtered(), error: null }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };
}

async function loadAllocation(input: {
  estimateSubtotal: number;
  estimateTax: number;
  estimateDiscount: number;
  milestoneAmount: number;
}) {
  const result = await getEstimateInvoicePrefill(
    "estimate-1",
    "milestone-1",
    fakeClient({
      estimateSubtotal: input.estimateSubtotal,
      estimateTax: input.estimateTax,
      estimateDiscount: input.estimateDiscount,
      milestones: [{ id: "milestone-1", amount: input.milestoneAmount }],
    }) as never
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.prefill;
}

describe("tax-inclusive Estimate milestone invoice allocation", () => {
  it("keeps a no-tax milestone as the invoice subtotal and total", async () => {
    const prefill = await loadAllocation({
      estimateSubtotal: 1_000,
      estimateTax: 0,
      estimateDiscount: 0,
      milestoneAmount: 250,
    });

    expect(prefill).toMatchObject({
      amount: 250,
      invoiceSubtotal: 250,
      invoiceTaxPct: 0,
      invoiceTaxAmount: 0,
      invoiceTotal: 250,
    });
  });

  it("backs tax out of a tax-inclusive milestone without increasing its final total", async () => {
    const prefill = await loadAllocation({
      estimateSubtotal: 100_000,
      estimateTax: 5_000,
      estimateDiscount: 0,
      milestoneAmount: 20_000,
    });

    expect(prefill).toMatchObject({
      amount: 20_000,
      invoiceSubtotal: 19_047.62,
      invoiceTaxPct: 5,
      invoiceTaxAmount: 952.38,
      invoiceTotal: 20_000,
    });
  });

  it("does not reapply an Estimate discount already embedded in the milestone", async () => {
    const prefill = await loadAllocation({
      estimateSubtotal: 100_000,
      estimateTax: 5_000,
      estimateDiscount: 10_000,
      milestoneAmount: 19_000,
    });

    expect(prefill).toMatchObject({
      amount: 19_000,
      invoiceSubtotal: 18_095.24,
      invoiceTaxPct: 5,
      invoiceTaxAmount: 904.76,
      invoiceTotal: 19_000,
    });
  });

  it("keeps currency rounding exact for a partial milestone", async () => {
    const prefill = await loadAllocation({
      estimateSubtotal: 1_234.56,
      estimateTax: 58.17,
      estimateDiscount: 12.34,
      milestoneAmount: 333.33,
    });

    expect(prefill.invoiceTotal).toBe(333.33);
    expect(Number((prefill.invoiceSubtotal + prefill.invoiceTaxAmount).toFixed(2))).toBe(333.33);
    expect(Number((prefill.invoiceSubtotal * (prefill.invoiceTaxPct / 100)).toFixed(2))).toBe(
      prefill.invoiceTaxAmount
    );
  });

  it("allocates multiple partial milestones independently without forcing a full schedule", async () => {
    const client = fakeClient({
      estimateSubtotal: 100_000,
      estimateTax: 5_000,
      estimateDiscount: 0,
      milestones: [
        { id: "milestone-1", amount: 20_000 },
        { id: "milestone-2", amount: 30_000 },
      ],
    });
    const results = await Promise.all(
      ["milestone-1", "milestone-2"].map((id) =>
        getEstimateInvoicePrefill("estimate-1", id, client as never)
      )
    );

    expect(results.every((result) => result.ok)).toBe(true);
    const totals = results.map((result) => (result.ok ? result.prefill.invoiceTotal : 0));
    expect(totals).toEqual([20_000, 30_000]);
    expect(totals.reduce((sum, amount) => sum + amount, 0)).toBeLessThan(105_000);
  });
});
