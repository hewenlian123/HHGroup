import { describe, expect, it, vi } from "vitest";
import {
  getCloseoutCompletion,
  getCloseoutPunch,
  getCloseoutWarranty,
  upsertCloseoutPunch,
} from "@/lib/project-closeout-db";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function queryResult(data: unknown, error: unknown = null) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "upsert", "single", "maybeSingle"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => void) => resolve({ data, error });
  return query;
}

describe("canonical Project Closeout data access", () => {
  it("loads the canonical punch parent and deterministic child order", async () => {
    const parent = queryResult({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      project_id: PROJECT_ID,
      inspection_date: "2026-08-02",
      inspector: "Owner",
      notes: null,
      contractor_signature: null,
      client_signature: null,
      created_at: "2026-08-02T00:00:00",
    });
    const items = queryResult([
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", item: "Second", status: "done", position: 1 },
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", item: "First", status: "pending", position: 0 },
    ]);
    const from = vi.fn((table: string) => {
      if (table === "final_punch_lists") return parent;
      if (table === "final_punch_list_items") return items;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getCloseoutPunch(PROJECT_ID, { from } as never);

    expect(from).toHaveBeenCalledWith("final_punch_lists");
    expect(from).toHaveBeenCalledWith("final_punch_list_items");
    expect(items.order).toHaveBeenNthCalledWith(1, "position", { ascending: true });
    expect(items.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(result?.items).toEqual([
      { item: "Second", status: "done" },
      { item: "First", status: "pending" },
    ]);
  });

  it("uses the atomic RPC and reloads the canonical state", async () => {
    const parent = queryResult({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      project_id: PROJECT_ID,
      inspection_date: null,
      inspector: null,
      notes: null,
      contractor_signature: null,
      client_signature: null,
      created_at: "2026-08-02T00:00:00",
    });
    const items = queryResult([{ id: "b", item: "Door", status: "pending", position: 0 }]);
    const rpc = vi.fn().mockResolvedValue({
      data: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      error: null,
    });
    const from = vi.fn((table: string) => (table === "final_punch_lists" ? parent : items));
    const client = { from, rpc } as never;

    const result = await upsertCloseoutPunch(
      PROJECT_ID,
      { items: [{ item: "Door", status: "pending" }] },
      client
    );

    expect(rpc).toHaveBeenCalledWith("replace_final_punch_list", {
      p_client_signature: null,
      p_contractor_signature: null,
      p_inspection_date: null,
      p_inspector: null,
      p_items: [{ item: "Door", status: "pending" }],
      p_notes: null,
      p_project_id: PROJECT_ID,
    });
    expect(result.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("reads warranty and completion only from canonical parents", async () => {
    const warranty = queryResult({
      id: "w",
      project_id: PROJECT_ID,
      start_date: null,
      period_months: 12,
      notes: null,
      created_at: "created",
    });
    const completion = queryResult({
      id: "c",
      project_id: PROJECT_ID,
      completion_date: null,
      contractor_name: null,
      client_name: null,
      contractor_signature: null,
      client_signature: null,
      created_at: "created",
    });
    const from = vi.fn((table: string) => (table === "warranties" ? warranty : completion));
    const client = { from } as never;

    expect(await getCloseoutWarranty(PROJECT_ID, client)).toMatchObject({ id: "w" });
    expect(await getCloseoutCompletion(PROJECT_ID, client)).toMatchObject({ id: "c" });
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "warranties",
      "completion_certificates",
    ]);
  });
});
