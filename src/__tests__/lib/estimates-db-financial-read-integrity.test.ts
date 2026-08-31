import { describe, expect, it } from "vitest";

import { getEstimateItems, getPaymentSchedule } from "@/lib/estimates-db";

type QueryResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

function readClient(...responses: QueryResult[]) {
  let next = 0;

  return {
    from() {
      const response = responses[next++];
      if (!response) throw new Error("Unexpected Supabase query in test.");
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        then: <T>(
          onfulfilled?: ((value: QueryResult) => T | PromiseLike<T>) | null,
          onrejected?: ((reason: unknown) => T | PromiseLike<T>) | null
        ) => Promise.resolve(response).then(onfulfilled, onrejected),
      };
      return query;
    },
  };
}

const noRows: QueryResult = { data: [], error: null };

describe("Estimate financial read integrity", () => {
  it("returns an empty item array only for a successful zero-row query", async () => {
    await expect(getEstimateItems("estimate-1", readClient(noRows) as never)).resolves.toEqual([]);
  });

  it("returns an empty payment schedule only for a successful zero-row query", async () => {
    await expect(getPaymentSchedule("estimate-1", readClient(noRows) as never)).resolves.toEqual(
      []
    );
  });

  it.each([
    [
      "estimate items",
      "estimate_items",
      (client: ReturnType<typeof readClient>) => getEstimateItems("estimate-1", client as never),
    ],
    [
      "payment milestones",
      "estimate_payment_schedule_items",
      (client: ReturnType<typeof readClient>) => getPaymentSchedule("estimate-1", client as never),
    ],
  ])(
    "throws EstimateFinancialReadError when successful %s query returns null data",
    async (_label, resource, load) => {
      await expect(load(readClient({ data: null, error: null }))).rejects.toMatchObject({
        name: "EstimateFinancialReadError",
        resource,
        estimateId: "estimate-1",
      });
    }
  );

  it("preserves legitimate numeric zero values from estimate items", async () => {
    await expect(
      getEstimateItems(
        "estimate-1",
        readClient({
          data: [
            {
              id: "item-1",
              estimate_id: "estimate-1",
              cost_code: "010000",
              desc: "Zero-cost allowance",
              qty: 0,
              unit: "EA",
              unit_cost: 0,
              markup_pct: 0,
              hide_amount_on_pdf: false,
              status: "included",
              sort_order: 0,
            },
          ],
          error: null,
        }) as never
      )
    ).resolves.toEqual([
      {
        id: "item-1",
        estimateId: "estimate-1",
        costCode: "010000",
        desc: "Zero-cost allowance",
        qty: 0,
        unit: "EA",
        unitCost: 0,
        markupPct: 0,
        hideAmountOnPdf: false,
        status: "included",
        sortOrder: 0,
      },
    ]);
  });

  it("preserves a legitimate zero-dollar payment milestone", async () => {
    await expect(
      getPaymentSchedule(
        "estimate-1",
        readClient({
          data: [
            {
              id: "milestone-1",
              estimate_id: "estimate-1",
              sort_order: 0,
              title: "Zero-dollar holdback",
              description: null,
              amount: 0,
              due_date: null,
              status: "draft",
              invoice_id: null,
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: "2026-08-01T00:00:00.000Z",
            },
          ],
          error: null,
        }) as never
      )
    ).resolves.toEqual([
      {
        id: "milestone-1",
        estimateId: "estimate-1",
        sortOrder: 0,
        title: "Zero-dollar holdback",
        description: null,
        amount: 0,
        dueDate: null,
        status: "draft",
        invoiceId: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
  });

  it("throws EstimateFinancialReadError when estimate items cannot be read", async () => {
    await expect(
      getEstimateItems(
        "estimate-1",
        readClient({
          data: null,
          error: {
            message: "Could not find the table 'public.estimate_items' in the schema cache",
          },
        }) as never
      )
    ).rejects.toMatchObject({
      name: "EstimateFinancialReadError",
      resource: "estimate_items",
      estimateId: "estimate-1",
    });
  });

  it("throws EstimateFinancialReadError when payment milestones cannot be read", async () => {
    await expect(
      getPaymentSchedule(
        "estimate-1",
        readClient({
          data: null,
          error: {
            message:
              "Could not find the table 'public.estimate_payment_schedule_items' in the schema cache",
          },
        }) as never
      )
    ).rejects.toMatchObject({
      name: "EstimateFinancialReadError",
      resource: "estimate_payment_schedule_items",
      estimateId: "estimate-1",
    });
  });

  it("throws EstimateFinancialReadError when the estimate-item sort fallback fails", async () => {
    await expect(
      getEstimateItems(
        "estimate-1",
        readClient(
          { data: null, error: { message: "column sort_order does not exist" } },
          { data: null, error: { message: "permission denied for table estimate_items" } }
        ) as never
      )
    ).rejects.toMatchObject({
      name: "EstimateFinancialReadError",
      resource: "estimate_items",
      estimateId: "estimate-1",
    });
  });

  it("throws EstimateFinancialReadError when the payment-milestone sort fallback fails", async () => {
    await expect(
      getPaymentSchedule(
        "estimate-1",
        readClient(
          { data: null, error: { message: "column sort_order does not exist" } },
          {
            data: null,
            error: { message: "permission denied for table estimate_payment_schedule_items" },
          }
        ) as never
      )
    ).rejects.toMatchObject({
      name: "EstimateFinancialReadError",
      resource: "estimate_payment_schedule_items",
      estimateId: "estimate-1",
    });
  });

  it.each([
    [
      "estimate items",
      "estimate_items",
      (client: ReturnType<typeof readClient>) => getEstimateItems("estimate-1", client as never),
    ],
    [
      "payment milestones",
      "estimate_payment_schedule_items",
      (client: ReturnType<typeof readClient>) => getPaymentSchedule("estimate-1", client as never),
    ],
  ])(
    "throws EstimateFinancialReadError when the %s sort fallback returns null data",
    async (_label, resource, load) => {
      await expect(
        load(
          readClient(
            { data: null, error: { message: "column sort_order does not exist" } },
            { data: null, error: null }
          )
        )
      ).rejects.toMatchObject({
        name: "EstimateFinancialReadError",
        resource,
        estimateId: "estimate-1",
      });
    }
  );

  it.each([
    ["NULL quantity", null],
    ["NaN quantity", Number.NaN],
    ["infinite unit price", Number.POSITIVE_INFINITY],
  ])("throws EstimateFinancialReadError for an estimate item with %s", async (_label, value) => {
    const row = {
      id: "item-1",
      estimate_id: "estimate-1",
      cost_code: "010000",
      desc: "Invalid financial input",
      qty: 1,
      unit: "EA",
      unit_cost: 10,
      markup_pct: 0,
      hide_amount_on_pdf: false,
      status: "included",
      sort_order: 0,
    };
    if (_label === "infinite unit price") row.unit_cost = value as number;
    else row.qty = value as number;

    await expect(
      getEstimateItems("estimate-1", readClient({ data: [row], error: null }) as never)
    ).rejects.toMatchObject({
      name: "EstimateFinancialReadError",
      resource: "estimate_items",
      estimateId: "estimate-1",
    });
  });

  it.each([
    ["NULL amount", null],
    ["NaN amount", Number.NaN],
    ["infinite amount", Number.POSITIVE_INFINITY],
  ])(
    "throws EstimateFinancialReadError for a payment milestone with %s",
    async (_label, amount) => {
      await expect(
        getPaymentSchedule(
          "estimate-1",
          readClient({
            data: [
              {
                id: "milestone-1",
                estimate_id: "estimate-1",
                sort_order: 0,
                title: "Invalid financial input",
                description: null,
                amount,
                due_date: null,
                status: "draft",
                invoice_id: null,
                created_at: "2026-08-01T00:00:00.000Z",
                updated_at: "2026-08-01T00:00:00.000Z",
              },
            ],
            error: null,
          }) as never
        )
      ).rejects.toMatchObject({
        name: "EstimateFinancialReadError",
        resource: "estimate_payment_schedule_items",
        estimateId: "estimate-1",
      });
    }
  );
});
