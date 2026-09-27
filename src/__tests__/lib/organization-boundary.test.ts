import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getUser: vi.fn(),
  members: [] as unknown[],
  project: null as unknown,
  readError: null as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: mocks.create,
  createServerSupabaseClient: mocks.create,
  getSupabaseUserFromRequest: vi.fn(),
  getSupabaseUserFromServerSession: vi.fn(),
}));
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
const org = "11111111-1111-4111-8111-111111111111";
const project = "22222222-2222-4222-8222-222222222222";
const request = () =>
  new Request("http://localhost/api/projects", {
    headers: { authorization: "Bearer verified-session" },
  });
beforeEach(() => {
  mocks.getUser.mockResolvedValue({
    data: {
      user: { id: "user", email: "member@example.invalid", app_metadata: { role: "owner" } },
    },
    error: null,
  });
  mocks.members = [{ organization_id: org, role: "assistant", status: "active" }];
  mocks.project = { id: project, organization_id: org };
  mocks.readError = null;
  mocks.create.mockImplementation(() => ({
    auth: { getUser: mocks.getUser },
    from(table: string) {
      const result = () => ({
        data: table === "projects" ? mocks.project : mocks.members,
        error: mocks.readError,
      });
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }));
});
describe("organization request authorization", () => {
  it("allows a real assistant member to read its project", async () => {
    const result = await requireOrganizationRequestClient(request(), { projectId: project });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.organizationRole).toBe("assistant");
  });
  it("denies assistant writes despite global owner metadata", async () => {
    const result = await requireOrganizationRequestClient(request(), {
      projectId: project,
      write: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
  it("denies a project hidden by membership RLS", async () => {
    mocks.project = null;
    const result = await requireOrganizationRequestClient(request(), { projectId: project });
    expect(result.ok).toBe(false);
  });
  it("does not grant an unassigned global owner access", async () => {
    mocks.members = [];
    const result = await requireOrganizationRequestClient(request());
    expect(result.ok).toBe(false);
  });
  it.each(["owner", "admin"])("allows scoped %s membership writes", async (role) => {
    mocks.members = [{ organization_id: org, role, status: "active" }];
    expect(
      (await requireOrganizationRequestClient(request(), { projectId: project, write: true })).ok
    ).toBe(true);
  });
  it("does not accept an inactive membership", async () => {
    mocks.members = [{ organization_id: org, role: "owner", status: "inactive" }];
    expect((await requireOrganizationRequestClient(request(), { projectId: project })).ok).toBe(
      false
    );
  });
  it("rejects project and requested organization mismatch", async () => {
    expect(
      (
        await requireOrganizationRequestClient(request(), {
          projectId: project,
          organizationId: "foreign",
        })
      ).ok
    ).toBe(false);
  });
  it("does not expose assistant organization scope to financial batch reads", async () => {
    mocks.members = [
      { organization_id: org, role: "assistant", status: "active" },
      { organization_id: "other", role: "admin", status: "active" },
    ];
    const result = await requireOrganizationRequestClient(request(), { requireOwnerAdmin: true });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.context.memberships.map((m) => m.organization_id)).toEqual(["other"]);
  });
  it("rejects a malformed bearer before constructing a client", async () => {
    mocks.create.mockClear();
    const result = await requireOrganizationRequestClient(
      new Request("http://localhost/api/projects", { headers: { authorization: "Basic invalid" } })
    );
    expect(result.ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("verifies the bearer token using the same request client", async () => {
    const req = request();
    const result = await requireOrganizationRequestClient(req);
    expect(result.ok).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledWith("verified-session");
    expect(mocks.create).toHaveBeenCalledWith(req, expect.anything(), {
      noStore: undefined,
      forwardAuthorization: true,
    });
  });
  it("verifies a cookie session without replacing it with a bearer token", async () => {
    const result = await requireOrganizationRequestClient(
      new Request("http://localhost/api/projects", { headers: { cookie: "sb-test=session" } })
    );
    expect(result.ok).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledWith(undefined);
  });
  it("fails unavailable for a null membership response", async () => {
    mocks.members = null as unknown as unknown[];
    const result = await requireOrganizationRequestClient(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
  it("fails closed when membership reads fail", async () => {
    mocks.readError = { message: "unavailable" };
    const result = await requireOrganizationRequestClient(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
