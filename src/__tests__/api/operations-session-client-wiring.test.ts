import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRouteSupabaseClient: vi.fn(),
  getAllScheduleWithProject: vi.fn(),
  getProjects: vi.fn(),
  getPunchListAll: vi.fn(),
  getPunchListSummary: vi.fn(),
  getSitePhotos: vi.fn(),
  getWorkers: vi.fn(),
  requireSupabaseOwnerOrAdmin: vi.fn(),
  strictClient: { from: vi.fn() },
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: mocks.requireSupabaseOwnerOrAdmin,
}));

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: mocks.createRouteSupabaseClient,
}));

vi.mock("@/lib/data", () => ({
  getAllScheduleWithProject: mocks.getAllScheduleWithProject,
  getProjects: mocks.getProjects,
  getPunchListAll: mocks.getPunchListAll,
  getPunchListSummary: mocks.getPunchListSummary,
  getSitePhotos: mocks.getSitePhotos,
  getWorkers: mocks.getWorkers,
}));

const authContext = {
  user: { id: "owner-1" },
  email: "owner@example.com",
  role: "owner",
};

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, init);
}

const readRoutes = [
  ["schedule", "/api/operations/schedule", () => import("@/app/api/operations/schedule/route")],
  [
    "punch-list",
    "/api/operations/punch-list",
    () => import("@/app/api/operations/punch-list/route"),
  ],
  [
    "site-photos",
    "/api/operations/site-photos",
    () => import("@/app/api/operations/site-photos/route"),
  ],
] as const;

describe("Operations API authenticated session client wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireSupabaseOwnerOrAdmin.mockResolvedValue({ ok: true, context: authContext });
    mocks.createRouteSupabaseClient.mockReturnValue(mocks.strictClient);
    mocks.getAllScheduleWithProject.mockResolvedValue([]);
    mocks.getProjects.mockResolvedValue([]);
    mocks.getPunchListAll.mockResolvedValue([]);
    mocks.getPunchListSummary.mockResolvedValue({ open: 0, assigned: 0, completed: 0 });
    mocks.getSitePhotos.mockResolvedValue([]);
    mocks.getWorkers.mockResolvedValue([]);
  });

  it("keeps Schedule GET behind the strict guard and forwards the request client", async () => {
    const { GET } = await import("@/app/api/operations/schedule/route");
    const req = request("/api/operations/schedule");

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(mocks.requireSupabaseOwnerOrAdmin).toHaveBeenCalledWith(req);
    expect(mocks.createRouteSupabaseClient).toHaveBeenCalledWith(req, expect.anything(), {
      noStore: true,
      forwardAuthorization: true,
    });
    expect(mocks.getAllScheduleWithProject).toHaveBeenCalledWith(mocks.strictClient);
    expect(mocks.getProjects).toHaveBeenCalledWith(mocks.strictClient);
  });

  it("keeps Punch List GET behind the strict guard and forwards one request client", async () => {
    const { GET } = await import("@/app/api/operations/punch-list/route");
    const req = request("/api/operations/punch-list?project_id=project-1&status=open");

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(mocks.requireSupabaseOwnerOrAdmin).toHaveBeenCalledWith(req);
    expect(mocks.createRouteSupabaseClient).toHaveBeenCalledWith(req, expect.anything(), {
      noStore: true,
      forwardAuthorization: true,
    });
    expect(mocks.getPunchListAll).toHaveBeenCalledWith(mocks.strictClient);
    expect(mocks.getPunchListSummary).toHaveBeenCalledWith(mocks.strictClient);
    expect(mocks.getProjects).toHaveBeenCalledWith(mocks.strictClient);
    expect(mocks.getWorkers).toHaveBeenCalledWith(mocks.strictClient);
  });

  it("keeps Site Photos GET behind the strict guard and forwards the request client", async () => {
    const { GET } = await import("@/app/api/operations/site-photos/route");
    const req = request("/api/operations/site-photos?project_id=project-1");

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(mocks.requireSupabaseOwnerOrAdmin).toHaveBeenCalledWith(req);
    expect(mocks.createRouteSupabaseClient).toHaveBeenCalledWith(req, expect.anything(), {
      noStore: true,
      forwardAuthorization: true,
    });
    expect(mocks.getSitePhotos).toHaveBeenCalledWith("project-1", mocks.strictClient);
    expect(mocks.getProjects).toHaveBeenCalledWith(mocks.strictClient);
  });

  it.each(readRoutes)(
    "rejects unauthenticated %s reads before any data access",
    async (_, path, load) => {
      mocks.requireSupabaseOwnerOrAdmin.mockResolvedValueOnce({
        ok: false,
        response: Response.json(
          { ok: false, message: "Authentication required." },
          { status: 401 }
        ),
      });
      const { GET } = await load();

      const response = await GET(request(path));

      expect(response.status).toBe(401);
      expect(mocks.createRouteSupabaseClient).not.toHaveBeenCalled();
      expect(mocks.getProjects).not.toHaveBeenCalled();
    }
  );

  it.each(readRoutes)(
    "fails closed when the %s request client is unavailable",
    async (_, path, load) => {
      mocks.createRouteSupabaseClient.mockReturnValueOnce(null);
      const { GET } = await load();

      const response = await GET(request(path));
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({ ok: false });
      expect(mocks.getProjects).not.toHaveBeenCalled();
    }
  );
});
