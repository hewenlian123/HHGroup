import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processInboxOcrBatch: vi.fn(),
  requireSupabaseOwnerOrAdminRequestClient: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminRequestClient: mocks.requireSupabaseOwnerOrAdminRequestClient,
}));

vi.mock("@/lib/expense-inbox-ocr-job", () => ({
  processInboxOcrBatch: mocks.processInboxOcrBatch,
}));

vi.mock("@/lib/supabase-server", () => ({
  SUPABASE_MISSING_SERVER_ENV_MESSAGE: "Supabase server env is missing.",
}));

import { POST } from "@/app/api/financial/expenses/ocr-worker/route";

function chainInit(
  fetchMock: ReturnType<typeof vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>>
): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1];
  if (!init) throw new Error("OCR chain was not requested.");
  return init;
}

describe("ocr worker self-chain", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.processInboxOcrBatch.mockReset().mockResolvedValue({
      processed: 1,
      failed: 0,
      remaining: 2,
    });
    mocks.requireSupabaseOwnerOrAdminRequestClient.mockReset().mockResolvedValue({
      ok: true,
      client: { session: "owner" },
    });
  });

  it("forwards the cookie and a bearer Authorization header", async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/financial/expenses/ocr-worker", {
        method: "POST",
        headers: {
          cookie: "sb-access-token=owner-session",
          authorization: "Bearer owner-access-token",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://localhost/api/financial/expenses/ocr-worker");
    expect(chainInit(fetchMock).method).toBe("POST");
    expect(init?.headers).toMatchObject({
      cookie: "sb-access-token=owner-session",
      authorization: "Bearer owner-access-token",
      "x-ocr-chain-depth": "1",
    });
  });

  it("keeps a cookie session when no bearer header is present", async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      new Request("http://localhost/api/financial/expenses/ocr-worker", {
        method: "POST",
        headers: { cookie: "sb-access-token=owner-session" },
      })
    );

    const init = chainInit(fetchMock);
    expect(init.headers).toMatchObject({ cookie: "sb-access-token=owner-session" });
    expect(init.headers).not.toHaveProperty("authorization");
  });

  it("does not forward a non-bearer Authorization header", async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      new Request("http://localhost/api/financial/expenses/ocr-worker", {
        method: "POST",
        headers: {
          cookie: "sb-access-token=owner-session",
          authorization: "Basic not-a-bearer",
        },
      })
    );

    const init = chainInit(fetchMock);
    expect(init.headers).not.toHaveProperty("authorization");
    expect(init.headers).toMatchObject({ cookie: "sb-access-token=owner-session" });
  });
});
