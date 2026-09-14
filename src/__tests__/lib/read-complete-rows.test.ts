import { expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readCompleteRows } from "@/lib/read-complete-rows";
for (const fault of [
  "denied",
  "null",
  "no-count",
  "truncated",
  "duplicate",
  "changing",
  "ceiling",
] as const) {
  it(`fails closed for ${fault} instead of publishing a partial total`, async () => {
    let calls = 0;
    const client = createClient("http://127.0.0.1:54321", "synthetic", {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          calls++;
          const offset = Number(new URL(String(input)).searchParams.get("offset") ?? 0);
          const total = fault === "ceiling" ? 10001 : fault === "changing" && offset ? 1002 : 1001;
          const data = Array.from({ length: Math.min(500, total - offset) }, (_, i) => ({
            id: `row-${offset + i}`,
          }));
          if (fault === "truncated") data.pop();
          if (fault === "duplicate" && offset) data[0].id = "row-0";
          return new Response(
            JSON.stringify(
              fault === "denied" && offset
                ? { message: "permission denied" }
                : fault === "null"
                  ? null
                  : data
            ),
            {
              status: fault === "denied" && offset ? 403 : 200,
              headers: {
                "Content-Type": "application/json",
                ...(fault === "no-count" ? {} : { "Content-Range": `0-0/${total}` }),
              },
            }
          );
        },
      },
    });
    await expect(
      readCompleteRows(() => client.from("invoices").select("id", { count: "exact" }))
    ).rejects.toThrow(/unavailable/);
    expect(calls).toBeLessThanOrEqual(2);
  });
}

it("uses the declared stable identity for operation state rows", async () => {
  const client = createClient("http://127.0.0.1:54321", "synthetic", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        expect(new URL(String(input)).searchParams.get("order")).toBe("expense_id.asc");
        return new Response(JSON.stringify([{ expense_id: "expense-1" }]), {
          headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
        });
      },
    },
  });
  await expect(
    readCompleteRows(
      () => client.from("expense_operations").select("*", { count: "exact" }),
      "Review",
      "expense_id"
    )
  ).resolves.toEqual({ data: [{ expense_id: "expense-1" }], error: null });
});
