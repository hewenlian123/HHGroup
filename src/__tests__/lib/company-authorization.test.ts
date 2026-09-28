import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  factory: vi.fn(),
  rows: [] as unknown[],
  error: null as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: mocks.create,
  createServerSupabaseClient: async () => mocks.create(),
  getSupabaseUserFromRequest: vi.fn(async () => ({ id: "user", app_metadata: { role: "owner" } })),
  getSupabaseUserFromServerSession: vi.fn(async () => ({
    id: "user",
    app_metadata: { role: "owner" },
  })),
}));
import {
  requireSupabaseOwnerOrAdminRequestClient,
  requireSupabaseOwnerOrAdminServerActionWithClient,
} from "@/lib/auth-boundary";
beforeEach(() => {
  mocks.rows = [];
  mocks.error = null;
  mocks.factory.mockReset().mockReturnValue({ privileged: true });
  mocks.create.mockImplementation(() => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user", app_metadata: { role: "owner" } } },
        error: null,
      }),
    },
    from() {
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve({ data: mocks.rows, error: mocks.error }).then(resolve),
      };
      return query;
    },
  }));
});
it("denies global owner without canonical company membership before creating a privileged client", async () => {
  const result = await requireSupabaseOwnerOrAdminServerActionWithClient(mocks.factory);
  expect(result.ok).toBe(false);
  expect(mocks.factory).not.toHaveBeenCalled();
});
it("denies global owner membership read errors", async () => {
  mocks.error = { message: "unavailable" };
  const result = await requireSupabaseOwnerOrAdminRequestClient(
    new Request("http://localhost/api/invoices")
  );
  expect(result.ok).toBe(false);
});
it("allows an active canonical company owner", async () => {
  mocks.rows = [
    { role: "owner", status: "active", organizations: { legacy_company_profile_id: "company" } },
  ];
  const result = await requireSupabaseOwnerOrAdminServerActionWithClient(mocks.factory);
  expect(result.ok).toBe(true);
  expect(mocks.factory).toHaveBeenCalledOnce();
});
