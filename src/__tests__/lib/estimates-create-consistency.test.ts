import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createEstimateWithClient,
  createEstimateWithItemsWithClient,
  updateLineItemWithClient,
} from "@/lib/estimates-db";

describe("createEstimateWithClient consistency", () => {
  it("persists the selected customer relation on the estimate row", async () => {
    const estimateId = "11111111-1111-4111-8111-111111111111";
    const customerId = "33333333-3333-4333-8333-333333333333";
    let estimateInsert: Record<string, unknown> | null = null;

    const client = {
      rpc: vi.fn().mockResolvedValue({ data: "EST-TEST", error: null }),
      from: vi.fn((table: string) => {
        if (table === "estimate_meta") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        if (table === "estimates") {
          const query = {
            insert: vi.fn((payload: Record<string, unknown>) => {
              estimateInsert = payload;
              return query;
            }),
            select: vi.fn(() => query),
            single: vi.fn().mockResolvedValue({
              data: { id: estimateId },
              error: null,
            }),
          };
          return query;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await createEstimateWithClient(client, {
      customerId,
      clientName: "Phase 1 QA",
      projectName: "Local project",
      address: "100 Local QA Lane",
    });

    expect(estimateInsert).toMatchObject({ customer_id: customerId });
  });

  it("removes the estimate row when estimate_meta creation fails", async () => {
    const deletedEstimateIds: string[] = [];
    const estimateId = "11111111-1111-4111-8111-111111111111";

    const client = {
      rpc: vi.fn().mockResolvedValue({ data: "EST-TEST", error: null }),
      from: vi.fn((table: string) => {
        if (table === "estimate_meta") {
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "permission denied for table estimate_meta" },
            }),
          };
        }

        if (table === "estimates") {
          const query = {
            insert: vi.fn(),
            select: vi.fn(),
            single: vi.fn().mockResolvedValue({
              data: { id: estimateId },
              error: null,
            }),
            delete: vi.fn(),
            eq: vi.fn(async (_column: string, id: string) => {
              deletedEstimateIds.push(id);
              return { data: null, error: null };
            }),
          };
          query.insert.mockReturnValue(query);
          query.select.mockReturnValue(query);
          query.delete.mockReturnValue(query);
          return query;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await expect(
      createEstimateWithClient(client, {
        clientName: "Phase 1 QA",
        projectName: "Local project",
        address: "100 Local QA Lane",
      })
    ).rejects.toThrow("permission denied for table estimate_meta");

    expect(deletedEstimateIds).toEqual([estimateId]);
  });

  it("rejects negative line-item quantities and prices before writing", async () => {
    const client = {} as SupabaseClient;

    await expect(
      createEstimateWithItemsWithClient(client, {
        clientName: "Phase 1 QA",
        projectName: "Local project",
        address: "100 Local QA Lane",
        items: [
          {
            costCode: "010000",
            desc: "Invalid negative quantity",
            qty: -1,
            unit: "EA",
            unitCost: 100,
            markupPct: 0,
          },
        ],
      })
    ).rejects.toThrow("non-negative");

    await expect(
      createEstimateWithItemsWithClient(client, {
        clientName: "Phase 1 QA",
        projectName: "Local project",
        address: "100 Local QA Lane",
        items: [
          {
            costCode: "010000",
            desc: "Invalid negative unit price",
            qty: 1,
            unit: "EA",
            unitCost: -100,
            markupPct: 0,
          },
        ],
      })
    ).rejects.toThrow("non-negative");
  });

  it("persists all items before inserting the server-validated payment schedule", async () => {
    const estimateId = "11111111-1111-4111-8111-111111111111";
    const events: string[] = [];
    let releaseItems!: () => void;
    let markItemsStarted!: () => void;
    const itemsStarted = new Promise<void>((resolve) => {
      markItemsStarted = resolve;
    });
    const itemsGate = new Promise<void>((resolve) => {
      releaseItems = resolve;
    });

    const client = {
      rpc: vi.fn().mockResolvedValue({ data: "EST-TEST", error: null }),
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          const query = {
            insert: vi.fn(() => query),
            select: vi.fn(() => query),
            single: vi.fn().mockResolvedValue({ data: { id: estimateId }, error: null }),
          };
          return query;
        }
        if (table === "estimate_meta") {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        if (table === "estimate_categories") {
          return {
            upsert: vi.fn(async () => {
              events.push("categories");
              return { data: null, error: null };
            }),
          };
        }
        if (table === "estimate_items") {
          return {
            insert: vi.fn(async () => {
              events.push("items:start");
              markItemsStarted();
              await itemsGate;
              events.push("items:complete");
              return { data: null, error: null };
            }),
          };
        }
        if (table === "estimate_payment_schedule_items") {
          return {
            insert: vi.fn(async () => {
              events.push("schedule");
              return { data: null, error: null };
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    const createPromise = createEstimateWithItemsWithClient(client, {
      clientName: "Phase 1 QA",
      projectName: "Local project",
      address: "100 Local QA Lane",
      categoryNames: { "010000": "General Requirements" },
      items: [
        {
          costCode: "010000",
          desc: "Server-authoritative item",
          qty: 1,
          unit: "EA",
          unitCost: 100,
          markupPct: 0,
        },
      ],
      paymentSchedule: [{ title: "Deposit", amount: 100 }],
    });

    await itemsStarted;
    expect(events).toEqual(["categories", "items:start"]);
    releaseItems();
    await expect(createPromise).resolves.toBe(estimateId);
    expect(events).toEqual(["categories", "items:start", "items:complete", "schedule"]);
  });

  it("refuses negative persisted line-item edits before querying", async () => {
    const client = {} as SupabaseClient;

    await expect(
      updateLineItemWithClient(client, "estimate-id", "item-id", { qty: -1 })
    ).resolves.toBe(false);
    await expect(
      updateLineItemWithClient(client, "estimate-id", "item-id", { unitCost: -1 })
    ).resolves.toBe(false);
  });
});
