import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("ensure-schema Production isolation", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock("@/lib/auth-boundary");
    vi.doUnmock("@/lib/ensure-schema-auto-repair");
    vi.resetModules();
  });

  it("returns 404 before calling Auth or loading application-time DDL, even with the internal secret", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      HH_INTERNAL_ADMIN_SECRET: "server-secret",
    };
    vi.resetModules();
    let authBoundaryCalled = false;
    let autoRepairLoaded = false;
    let autoRepairCalled = false;
    vi.doMock("@/lib/auth-boundary", () => ({
      requireSupabaseOwnerOrAdmin: async () => {
        authBoundaryCalled = true;
        return { ok: true, context: { role: "owner" } };
      },
    }));
    vi.doMock("@/lib/ensure-schema-auto-repair", () => {
      autoRepairLoaded = true;
      return {
        runSchemaAutoRepair: async () => {
          autoRepairCalled = true;
          return { ok: true, message: "unexpected Production repair", applied: 1 };
        },
      };
    });

    const { POST } = await import("@/app/api/ensure-schema/route");
    const response = await POST(
      new Request("https://hhprojectgroup.com/api/ensure-schema", {
        method: "POST",
        headers: { "x-internal-admin-secret": "server-secret" },
      })
    );

    expect(response.status).toBe(404);
    expect(authBoundaryCalled).toBe(false);
    expect(autoRepairLoaded).toBe(false);
    expect(autoRepairCalled).toBe(false);
  });
});
