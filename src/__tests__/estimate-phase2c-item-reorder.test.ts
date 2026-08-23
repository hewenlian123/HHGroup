import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildEstimateItemMoveOrder, persistedEstimateItemIds } from "@/lib/estimate-item-reorder";
import { reorderEstimateItemsWithClient } from "@/lib/estimates-db";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260822190000_estimate_item_atomic_reorder.sql"
);

describe("Estimate Phase 2C item reorder contract", () => {
  const sections = [
    { costCode: "100000", itemIds: ["a", "b", "c"] },
    { costCode: "200000", itemIds: ["d", "e"] },
  ];

  it("builds normalized same-Section up/down order without dropping an item", () => {
    expect(
      buildEstimateItemMoveOrder(sections, "c", {
        costCode: "100000",
        position: "before",
        itemId: "b",
      })
    ).toEqual([
      { id: "a", costCode: "100000" },
      { id: "c", costCode: "100000" },
      { id: "b", costCode: "100000" },
      { id: "d", costCode: "200000" },
      { id: "e", costCode: "200000" },
    ]);
  });

  it("moves an item across Sections at an exact position", () => {
    expect(
      buildEstimateItemMoveOrder(sections, "b", {
        costCode: "200000",
        position: "after",
        itemId: "d",
      })
    ).toEqual([
      { id: "a", costCode: "100000" },
      { id: "c", costCode: "100000" },
      { id: "d", costCode: "200000" },
      { id: "b", costCode: "200000" },
      { id: "e", costCode: "200000" },
    ]);
  });

  it("uses the persisted sort_order and id tie-break as the stale-write precondition", () => {
    expect(
      persistedEstimateItemIds([
        { id: "c", sortOrder: 2 },
        { id: "b", sortOrder: 1 },
        { id: "a", sortOrder: 1 },
      ])
    ).toEqual(["a", "b", "c"]);
  });

  it("sends only ids, Section codes, and expected authoritative order to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const result = await reorderEstimateItemsWithClient(
      { rpc } as never,
      "11111111-1111-4111-8111-111111111111",
      [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", costCode: "100000" },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", costCode: "100000" },
      ],
      [
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", costCode: "200000" },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", costCode: "100000" },
      ]
    );

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("reorder_estimate_items", {
      p_estimate_id: "11111111-1111-4111-8111-111111111111",
      p_expected_items: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", costCode: "100000" },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", costCode: "100000" },
      ],
      p_ordered_items: [
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", costCode: "200000" },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", costCode: "100000" },
      ],
    });
  });

  it("returns an explicit stale-order result and never retries blindly", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "40001", message: "Estimate items changed." },
    });
    const result = await reorderEstimateItemsWithClient(
      { rpc } as never,
      "11111111-1111-4111-8111-111111111111",
      [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", costCode: "100000" }],
      [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", costCode: "100000" }]
    );

    expect(result).toEqual({
      ok: false,
      stale: true,
      error: "Estimate items changed. Reloaded the latest order; try again.",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("locks and validates the full set before atomically updating only Section and order", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.reorder_estimate_items/i);
    expect(sql).toMatch(/from\s+public\.estimate_items[\s\S]*for\s+update/i);
    expect(sql).toMatch(/v_current_items\s*<>\s*p_expected_items/i);
    expect(sql).toMatch(/every Estimate item exactly once/i);
    expect(sql).toMatch(
      /update\s+public\.estimate_items[\s\S]*set\s+cost_code\s*=[\s\S]*sort_order\s*=/i
    );
    expect(sql).not.toMatch(/set[\s\S]{0,160}(?:qty|unit_cost|status|hide_amount_on_pdf)\s*=/i);
    expect(sql).toMatch(/grant\s+execute[\s\S]*to\s+service_role/i);
    expect(sql).toMatch(/revoke\s+all[\s\S]*from\s+authenticated/i);
  });
});
