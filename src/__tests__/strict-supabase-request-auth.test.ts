import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, createServerClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...actual, createClient: createClientMock };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

import * as supabaseServer from "@/lib/supabase-server";

const ORIGINAL_ENV = { ...process.env };
const USER = {
  app_metadata: { role: "owner" },
  aud: "authenticated",
  created_at: "2026-08-01T00:00:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
  user_metadata: {},
};

type StrictAuthFunction = (
  request: Request
) => Promise<{ client: unknown; source: "bearer" | "cookie"; user: typeof USER } | null>;

function strictAuth(): StrictAuthFunction | undefined {
  return (
    supabaseServer as typeof supabaseServer & {
      getStrictSupabaseRequestAuth?: StrictAuthFunction;
    }
  ).getStrictSupabaseRequestAuth;
}

describe("strict request-scoped Supabase authentication", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    };
    createClientMock.mockReset();
    createServerClientMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("exports a strict request authentication helper", () => {
    expect(typeof strictAuth()).toBe("function");
  });

  it("verifies a Bearer token and returns the same authenticated client for permission RPCs", async () => {
    const helper = strictAuth();
    expect(typeof helper).toBe("function");
    if (!helper) return;
    const bearerClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
      rpc: vi.fn(),
    };
    createClientMock.mockReturnValue(bearerClient);

    const result = await helper(
      new Request("http://localhost:3000/api/projects/test", {
        headers: { authorization: "Bearer verified-access-token" },
      })
    );

    expect(result).toEqual({ client: bearerClient, source: "bearer", user: USER });
    expect(bearerClient.auth.getUser).toHaveBeenCalledWith("verified-access-token");
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("does not fall back to cookies when a supplied Bearer token is invalid", async () => {
    const helper = strictAuth();
    expect(typeof helper).toBe("function");
    if (!helper) return;
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "invalid token" },
        }),
      },
    });

    const result = await helper(
      new Request("http://localhost:3000/api/projects/test", {
        headers: {
          authorization: "Bearer invalid-access-token",
          cookie: "sb-valid-cookie=must-not-fallback",
        },
      })
    );

    expect(result).toBeNull();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header without cookie fallback", async () => {
    const helper = strictAuth();
    expect(typeof helper).toBe("function");
    if (!helper) return;

    const result = await helper(
      new Request("http://localhost:3000/api/projects/test", {
        headers: {
          authorization: "Basic not-accepted",
          cookie: "sb-valid-cookie=must-not-fallback",
        },
      })
    );

    expect(result).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("verifies a cookie session when no Authorization header is supplied", async () => {
    const helper = strictAuth();
    expect(typeof helper).toBe("function");
    if (!helper) return;
    const cookieClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
      rpc: vi.fn(),
    };
    createServerClientMock.mockReturnValue(cookieClient);

    const result = await helper(
      new Request("http://localhost:3000/api/projects/test", {
        headers: { cookie: "sb-valid-cookie=opaque" },
      })
    );

    expect(result).toEqual({ client: cookieClient, source: "cookie", user: USER });
    expect(cookieClient.auth.getUser).toHaveBeenCalledWith();
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
