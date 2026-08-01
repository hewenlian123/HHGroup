import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => ({ from: fromMock }),
}));

import { getEstimateList } from "@/lib/estimates-db";

type QueryState = {
  equals?: { column: string; value: string };
  ids?: string[];
};

function queryBuilder(table: string) {
  const state: QueryState = {};
  const ids = Array.from({ length: 30 }, (_, index) => `estimate-${index + 1}`);

  const result = () => {
    if (table === "estimates") {
      return {
        data: ids.map((id, index) => ({
          id,
          number: `EST-${index + 1}`,
          client: `Client ${index + 1}`,
          project: "Project",
          status: "Draft",
          updated_at: "2026-07-30",
          approved_at: null,
        })),
        error: null,
      };
    }

    const requestedIds = state.ids ?? (state.equals ? [state.equals.value] : ids);
    if (table === "estimate_meta") {
      return {
        data: requestedIds.map((estimateId) => ({
          estimate_id: estimateId,
          client_name: "Client",
          project_name: "Project",
          tax: 0,
          discount: 0,
        })),
        error: null,
      };
    }
    if (table === "estimate_items") {
      return {
        data: requestedIds.map((estimateId) => ({
          id: `item-${estimateId}`,
          estimate_id: estimateId,
          cost_code: "scope",
          desc: "Work",
          qty: 2,
          unit: "EA",
          unit_cost: 1250,
          markup_pct: 0,
          status: "included",
          sort_order: 0,
        })),
        error: null,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };

  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    eq: vi.fn((column: string, value: string) => {
      state.equals = { column, value };
      return builder;
    }),
    in: vi.fn((_column: string, values: string[]) => {
      state.ids = values;
      return builder;
    }),
    single: vi.fn(async () => {
      const response = result();
      return { data: response.data[0] ?? null, error: response.error };
    }),
    then: (
      resolve: (value: ReturnType<typeof result>) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result()).then(resolve, reject),
  };
  return builder;
}

describe("getEstimateList batching", () => {
  beforeEach(() => {
    fromMock.mockReset().mockImplementation((table: string) => queryBuilder(table));
  });

  it("loads metadata and items in one query per table", async () => {
    const estimates = await getEstimateList(() => undefined);

    expect(estimates).toHaveLength(30);
    expect(estimates.every((estimate) => estimate.total === 2500)).toBe(true);
    expect(fromMock.mock.calls.filter(([table]) => table === "estimates")).toHaveLength(1);
    expect(fromMock.mock.calls.filter(([table]) => table === "estimate_meta")).toHaveLength(1);
    expect(fromMock.mock.calls.filter(([table]) => table === "estimate_items")).toHaveLength(1);
  });
});
