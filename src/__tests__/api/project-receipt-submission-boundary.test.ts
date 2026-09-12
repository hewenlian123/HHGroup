import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({
  company: vi.fn(),
  guard: vi.fn(),
  anonInsert: vi.fn(),
  sessionRpc: vi.fn(),
}));
vi.mock("@/lib/auth-boundary", () => ({
  requireOrganizationRequestClient: mocks.guard,
  requireCompanyRequestClient: mocks.company,
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: () => ({ from: () => ({ insert: mocks.anonInsert }) }),
}));
import { POST } from "@/app/api/upload-receipt/submit/route";
const projectId = "11111111-1111-4111-8111-111111111111";
const request = (project: string | null) =>
  new Request("http://localhost/api/upload-receipt/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workerId: "22222222-2222-4222-8222-222222222222",
      projectId: project,
      amount: 12,
      receiptUrl: "uploads/33333333-3333-4333-8333-333333333333.pdf",
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.anonInsert.mockResolvedValue({ error: null });
  mocks.sessionRpc.mockResolvedValue({ error: null });
  mocks.company.mockResolvedValue({
    ok: true,
    client: { rpc: mocks.sessionRpc },
    sessionResponse: NextResponse.next(),
  });
});
describe("receipt project assignment authorization", () => {
  it("rejects denied project assignment before receipt insertion", async () => {
    mocks.guard.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 403 }),
    });
    const response = await POST(request(projectId));
    expect(response.status).toBe(403);
    expect(mocks.anonInsert).not.toHaveBeenCalled();
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });
  it("uses the scoped writable session and rotates cookies for project assignment", async () => {
    const sessionResponse = NextResponse.next();
    sessionResponse.cookies.set("sb-session", "rotated");
    mocks.guard.mockResolvedValue({
      ok: true,
      client: { rpc: mocks.sessionRpc },
      sessionResponse,
    });
    const response = await POST(request(projectId));
    expect(response.status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(Request), {
      projectId,
      noStore: true,
    });
    expect(mocks.sessionRpc).toHaveBeenCalledWith(
      "intake_worker_receipt_atomic",
      expect.objectContaining({
        p_receipt_id: "33333333-3333-4333-8333-333333333333",
        p_payload: expect.objectContaining({ project_id: projectId }),
      })
    );
    expect(mocks.anonInsert).not.toHaveBeenCalled();
    expect(response.cookies.get("sb-session")?.value).toBe("rotated");
  });
  it("preserves unassigned intake through the authenticated company client", async () => {
    expect((await POST(request(null))).status).toBe(200);
    expect(mocks.company).toHaveBeenCalledOnce();
    expect(mocks.sessionRpc).toHaveBeenCalledWith(
      "intake_worker_receipt_atomic",
      expect.objectContaining({
        p_receipt_id: "33333333-3333-4333-8333-333333333333",
        p_payload: expect.objectContaining({ project_id: null }),
      })
    );
    expect(mocks.anonInsert).not.toHaveBeenCalled();
  });
  it("denies anonymous unassigned intake before insertion", async () => {
    mocks.company.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    expect((await POST(request(null))).status).toBe(401);
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
    expect(mocks.anonInsert).not.toHaveBeenCalled();
  });
});
