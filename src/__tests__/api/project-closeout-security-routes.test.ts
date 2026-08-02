import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminFactoryMock,
  adminFromMock,
  completionUpsertMock,
  projectMaybeSingleMock,
  punchUpsertMock,
  strictAuthMock,
  userRpcMock,
  warrantyUpsertMock,
} = vi.hoisted(() => ({
  adminFactoryMock: vi.fn(),
  adminFromMock: vi.fn(),
  completionUpsertMock: vi.fn(),
  projectMaybeSingleMock: vi.fn(),
  punchUpsertMock: vi.fn(),
  strictAuthMock: vi.fn(),
  userRpcMock: vi.fn(),
  warrantyUpsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: adminFactoryMock,
  getStrictSupabaseRequestAuth: strictAuthMock,
}));

vi.mock("@/lib/data", () => ({
  upsertCloseoutCompletion: completionUpsertMock,
  upsertCloseoutPunch: punchUpsertMock,
  upsertCloseoutWarranty: warrantyUpsertMock,
}));

import { authorizeProjectCloseoutMutation } from "@/lib/project-closeout-security";
import { CloseoutDatabaseError } from "@/lib/project-closeout-db";
import { POST as postPunch } from "@/app/api/projects/[id]/closeout/punch/route";
import { POST as postWarranty } from "@/app/api/projects/[id]/closeout/warranty/route";
import { POST as postCompletion } from "@/app/api/projects/[id]/closeout/completion/route";

const ORIGIN = "http://localhost:3104";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const userClient = { rpc: userRpcMock };

const projectQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: projectMaybeSingleMock };
projectQuery.select.mockReturnValue(projectQuery);
projectQuery.eq.mockReturnValue(projectQuery);
const adminClient = { from: adminFromMock };

function request(body: unknown): Request {
  return new Request(`${ORIGIN}/api/projects/${PROJECT_ID}/closeout/punch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

const validPunch = {
  inspection_date: "2026-08-02",
  inspector: "Owner",
  notes: null,
  contractor_signature: null,
  client_signature: null,
  items: [{ item: "Door", status: "pending" }],
};

describe("Project Closeout route-local security", () => {
  beforeEach(() => {
    strictAuthMock.mockReset().mockResolvedValue({
      client: userClient,
      source: "cookie",
      user: { id: "22222222-2222-4222-8222-222222222222" },
    });
    userRpcMock.mockReset().mockResolvedValue({ data: true, error: null });
    projectMaybeSingleMock.mockReset().mockResolvedValue({ data: { id: PROJECT_ID }, error: null });
    adminFromMock.mockReset().mockReturnValue(projectQuery);
    adminFactoryMock.mockReset().mockReturnValue(adminClient);
    punchUpsertMock.mockReset().mockResolvedValue({ id: "punch" });
    warrantyUpsertMock.mockReset().mockResolvedValue({ id: "warranty" });
    completionUpsertMock.mockReset().mockResolvedValue({ id: "completion" });
  });

  it("returns 401 before creating a service client for an anonymous caller", async () => {
    strictAuthMock.mockResolvedValue(null);

    const result = await authorizeProjectCloseoutMutation({
      kind: "punch",
      projectId: PROJECT_ID,
      request: request(validPunch),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it("returns 403 before service access when projects.update is denied", async () => {
    userRpcMock.mockResolvedValue({ data: false, error: null });

    const result = await authorizeProjectCloseoutMutation({
      kind: "punch",
      projectId: PROJECT_ID,
      request: request(validPunch),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(userRpcMock).toHaveBeenCalledWith("has_perm", { p_key: "projects.update" });
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it("rejects unknown fields before authentication", async () => {
    const result = await authorizeProjectCloseoutMutation({
      kind: "punch",
      projectId: PROJECT_ID,
      request: request({ ...validPunch, unexpected: true }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
    expect(strictAuthMock).not.toHaveBeenCalled();
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid date", { ...validPunch, inspection_date: "2026-02-30" }],
    ["invalid status", { ...validPunch, items: [{ item: "Door", status: "complete" }] }],
    [
      "excess items",
      {
        ...validPunch,
        items: Array.from({ length: 201 }, () => ({ item: "x", status: "pending" })),
      },
    ],
    [
      "excess item text",
      { ...validPunch, items: [{ item: "x".repeat(1_001), status: "pending" }] },
    ],
    ["coerced status", { ...validPunch, items: [{ item: "Door", status: 1 }] }],
  ])("rejects %s at the route boundary", async (_label, body) => {
    const result = await authorizeProjectCloseoutMutation({
      kind: "punch",
      projectId: PROJECT_ID,
      request: request(body),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
    expect(strictAuthMock).not.toHaveBeenCalled();
    expect(adminFactoryMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized JSON body before authentication", async () => {
    const result = await authorizeProjectCloseoutMutation({
      kind: "punch",
      projectId: PROJECT_ID,
      request: request({ ...validPunch, notes: "x".repeat(65_537) }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
    expect(strictAuthMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site mutations before authentication", async () => {
    const crossSiteRequest = request(validPunch);
    crossSiteRequest.headers.set("origin", "https://attacker.example");
    crossSiteRequest.headers.set("sec-fetch-site", "cross-site");

    const result = await authorizeProjectCloseoutMutation({
      kind: "punch",
      projectId: PROJECT_ID,
      request: crossSiteRequest,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(strictAuthMock).not.toHaveBeenCalled();
  });

  it("authorizes Owner flow and invokes punch RPC through the service client", async () => {
    const response = await postPunch(request(validPunch), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(adminFactoryMock).toHaveBeenCalledOnce();
    expect(punchUpsertMock).toHaveBeenCalledWith(PROJECT_ID, validPunch, adminClient);
  });

  it("routes warranty and completion to canonical service upserts", async () => {
    const warrantyResponse = await postWarranty(
      request({ start_date: "2026-08-02", period_months: 12, notes: null }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    );
    const completionResponse = await postCompletion(
      request({
        completion_date: "2026-08-02",
        contractor_name: "HH Group",
        client_name: "Client",
        contractor_signature: null,
        client_signature: null,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    );

    expect(warrantyResponse.status).toBe(200);
    expect(completionResponse.status).toBe(200);
    expect(warrantyUpsertMock).toHaveBeenCalledWith(PROJECT_ID, expect.any(Object), adminClient);
    expect(completionUpsertMock).toHaveBeenCalledWith(PROJECT_ID, expect.any(Object), adminClient);
  });

  it("maps lock conflicts to a generic 409 without database details", async () => {
    punchUpsertMock.mockRejectedValue(new CloseoutDatabaseError("conflict"));

    const response = await postPunch(request(validPunch), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Closeout update in progress; retry.",
    });
  });
});
