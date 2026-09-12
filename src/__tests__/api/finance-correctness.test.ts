import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/auth-boundary", () => ({ requireSupabaseOwnerOrAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseInternalNoStore: () => state.client,
  SUPABASE_MISSING_SERVER_ENV_MESSAGE: "Missing local client",
}));
beforeEach(() => {
  state.client = null;
});
it("persists vendor inactive status when schema discovery is unavailable", async () => {
  let row = { id: "vendor-1", name: "TEST Vendor", status: "active" };
  state.client = {
    from: (table: string) => {
      if (table === "information_schema.columns")
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: null, error: { message: "schema not exposed" } }),
            }),
          }),
        };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: row, error: null }),
        update: (patch: Partial<typeof row>) => {
          row = { ...row, ...patch };
          return query;
        },
      };
      return query;
    },
  };
  const { PATCH } = await import("@/app/api/vendors/[id]/route");
  const response = await PATCH(
    new Request("http://localhost/api/vendors/vendor-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "inactive" }),
    }),
    { params: { id: "vendor-1" } }
  );
  expect(response.status).toBe(200);
  expect(row.status).toBe("inactive");
  expect((await response.json()).vendor.status).toBe("inactive");
});
it.each([
  { status: "Rejected", reimbursement_id: null, allowed: true },
  { status: "Pending", reimbursement_id: null, allowed: true },
  { status: "Approved", reimbursement_id: "reimbursement-1", allowed: false },
  { status: "Paid", reimbursement_id: null, allowed: false },
  { status: "Rejected", reimbursement_id: "reimbursement-1", allowed: false },
  { status: "Pending", reimbursement_id: null, canonical_ingested_at: null, allowed: false },
  { status: "Rejected", reimbursement_id: null, canonical_ingested_at: null, allowed: false },
])(
  "resets only unlinked unsettled receipt: $status $reimbursement_id",
  async ({ status, reimbursement_id, allowed, canonical_ingested_at = "2026-09-10T00:00:00Z" }) => {
    let row: Record<string, unknown> = {
      id: "receipt-1",
      status,
      reimbursement_id,
      canonical_ingested_at,
    };
    let patch: Record<string, unknown> = {};
    let matches = true;
    const query = {
      update: (value: Record<string, unknown>) => {
        patch = value;
        return query;
      },
      eq: (key: string, value: unknown) => {
        matches &&= row[key] === value;
        return query;
      },
      is: (key: string, value: unknown) => {
        matches &&= row[key] === value;
        return query;
      },
      neq: (key: string, value: unknown) => {
        matches &&= row[key] !== value;
        return query;
      },
      not: (key: string, operator: string, value: unknown) => {
        expect([key, operator, value]).toEqual(["canonical_ingested_at", "is", null]);
        matches &&= row[key] != null;
        return query;
      },
      in: (key: string, values: unknown[]) => {
        matches &&= values.includes(row[key]);
        return query;
      },
      select: () => query,
      maybeSingle: async () => {
        if (matches) row = { ...row, ...patch };
        return { data: matches ? row : null, error: null };
      },
    };
    const client = { from: () => query } as unknown as SupabaseClient;
    const { resetWorkerReceiptToPending } = await import("@/lib/worker-receipts-db");
    const result = resetWorkerReceiptToPending("receipt-1", client);
    if (allowed) expect((await result).status).toBe("Pending");
    else await expect(result).rejects.toThrow("cannot be reset");
    expect(row.canonical_ingested_at).toBe(canonical_ingested_at);
    expect(row.reimbursement_id).toBe(reimbursement_id);
    expect(row.status).toBe(allowed ? "Pending" : status);
  }
);
