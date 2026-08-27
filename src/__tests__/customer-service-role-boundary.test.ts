import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminClientMock, strictGuardMock } = vi.hoisted(() => ({
  adminClientMock: vi.fn(),
  strictGuardMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: adminClientMock,
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerActionWithClient: strictGuardMock,
}));

import { getAllCustomers } from "@/lib/customers-db";

describe("customer service-role authorization boundary", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/customers-db.ts"), "utf8");

  beforeEach(() => {
    adminClientMock.mockReset();
    strictGuardMock.mockReset().mockResolvedValue({
      ok: false,
      status: 401,
      error: "Authentication required.",
    });
  });

  it("rejects a direct unauthenticated call before constructing a service-role client", async () => {
    await expect(getAllCustomers()).rejects.toThrow("Authentication required.");
    expect(strictGuardMock).toHaveBeenCalledOnce();
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it("checks the authenticated owner/admin session before constructing an admin client", () => {
    const guardAt = source.indexOf("await requireSupabaseOwnerOrAdminServerActionWithClient(");
    const privilegedClientAt = source.indexOf("getServerSupabaseAdmin", guardAt);

    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(privilegedClientAt).toBeGreaterThan(guardAt);
  });

  it.each([
    "getAllCustomers",
    "getCustomerById",
    "createCustomer",
    "updateCustomer",
    "deleteCustomer",
  ])("gates %s through the authorized admin helper", (symbol) => {
    const symbolAt = source.indexOf(`function ${symbol}`);
    const nextExportAt = source.indexOf("export async function", symbolAt + 1);
    const body = source.slice(symbolAt, nextExportAt < 0 ? source.length : nextExportAt);

    expect(symbolAt).toBeGreaterThanOrEqual(0);
    expect(body).toContain("await authorizedAdmin()");
  });
});
