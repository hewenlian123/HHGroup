import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  laborActiveSection,
  laborPaymentHref,
  isLaborWorkspace,
  workerTabHref,
} from "@/lib/navigation/labor-workspace";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";
import { getWorkerAdvances } from "@/lib/worker-advances-db";

function client(result: {
  data: unknown[] | null;
  error: { code: string; message: string } | null;
}) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "order", "eq", "gte", "lte", "in", "limit"])
    chain[name] = () => chain;
  chain.then = (resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return { from: () => chain } as unknown as SupabaseClient;
}
describe("Labor workspace", () => {
  it("missing project attribution is unavailable, never a successful empty project cost", async () => {
    await expect(
      getLaborEntriesWithJoins(
        { project_id: "project-a" },
        client({
          data: null,
          error: { code: "42703", message: "column labor_entries.project_id does not exist" },
        })
      )
    ).rejects.toThrow("project attribution is missing");
  });
  it("preserves worker/project/deep-link context when changing tabs", () => {
    const href = workerTabHref(
      "/workers/worker-a",
      "projectId=project-b&returnTo=%2Flabor%2Fcosts&entryId=time-c&tab=work",
      "reimbursements"
    );
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/workers/worker-a");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      projectId: "project-b",
      returnTo: "/labor/costs",
      entryId: "time-c",
      tab: "reimbursements",
    });
  });
  it("keeps payment type navigation inside the source worker context", () => {
    const href = laborPaymentHref(
      "/labor/advances",
      "workerId=worker-a&projectId=project-b&returnTo=%2Flabor%2Fcosts&new=1"
    );
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/workers/worker-a");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      workerId: "worker-a",
      projectId: "project-b",
      returnTo: "/labor/costs",
      tab: "advances",
    });
    expect(laborPaymentHref("/labor/worker-balances", "workerId=worker-a")).toContain(
      "tab=balance"
    );
    expect(laborPaymentHref("/labor/payments", "")).toBe("/labor/payments");
    expect(laborActiveSection("/reports/workforce", "unknown")).toBe("Overview");
    const nested = laborPaymentHref(
      "/labor/payments",
      new URLSearchParams({
        workerId: "worker-a",
        returnTo:
          "/workers/worker-a?projectId=project-b&returnTo=%2Flabor%2Foverview&tab=reimbursements",
        new: "1",
      }).toString()
    );
    const recovered = new URL(nested, "http://localhost");
    expect(recovered.searchParams.get("projectId")).toBe("project-b");
    expect(recovered.searchParams.get("returnTo")).toBe("/labor/overview");
    expect(recovered.searchParams.get("tab")).toBe("payments");
  });
  it("groups only Labor financial routes without capturing frozen Finance/Projects", () => {
    expect(laborActiveSection("/labor/advances")).toBe("Payments");
    expect(laborActiveSection("/reports/workforce", "payroll")).toBe("Payroll");
    expect(laborActiveSection("/labor/costs")).toBe("Costs");
    expect(laborActiveSection("/workers/worker-a")).toBe("Workers");
    for (const route of [
      "/financial/payments",
      "/financial/payables/payments",
      "/projects",
      "/estimates/one",
      "/labor/subcontractors",
      "/labor/payments/one/receipt",
      "/workers/one/statement/print",
    ])
      expect(isLaborWorkspace(route), route).toBe(false);
  });
  for (const [name, read] of [
    ["payments", (c: SupabaseClient) => getWorkerPaymentsWithClient(c)],
    ["advances", (c: SupabaseClient) => getWorkerAdvances(undefined, c)],
  ] as const) {
    it(`${name}: successful empty is empty, schema/permission/query failure is unavailable`, async () => {
      await expect(read(client({ data: [], error: null }))).resolves.toEqual([]);
      for (const error of [
        { code: "42P01", message: "relation does not exist" },
        { code: "42501", message: "permission denied" },
        { code: "XX000", message: "query failed" },
      ])
        await expect(read(client({ data: null, error }))).rejects.toThrow();
    });
  }
});
