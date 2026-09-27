import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn((...args: unknown[]) => {
    void args;
    return { from: vi.fn() };
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { createRouteSupabaseClient } from "@/lib/supabase-server";

const ORIGINAL_ENV = { ...process.env };

function responseSink() {
  return {
    cookies: { set: vi.fn() },
  };
}

describe("createRouteSupabaseClient authorization forwarding", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
    mocks.createServerClient.mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("forwards a bearer token only when the guarded caller explicitly opts in", () => {
    const request = new Request("https://app.example/api/operations/schedule", {
      headers: { Authorization: "Bearer verified-owner-token" },
    });

    createRouteSupabaseClient(request, responseSink() as never, {
      noStore: true,
      forwardAuthorization: true,
    });

    expect(mocks.createServerClient).toHaveBeenCalledOnce();
    expect(mocks.createServerClient.mock.calls[0]?.[2]).toMatchObject({
      global: {
        headers: { Authorization: "Bearer verified-owner-token" },
      },
    });
  });

  it.each([
    "bearer verified-owner-token",
    "BEARER\tverified-owner-token",
    "Bearer   verified-owner-token",
  ])(
    "canonicalizes a supported Bearer spelling before binding it to queries: %s",
    (authorization) => {
      const request = new Request("https://app.example/api/operations/schedule", {
        headers: { Authorization: authorization },
      });

      createRouteSupabaseClient(request, responseSink() as never, {
        noStore: true,
        forwardAuthorization: true,
      });

      expect(mocks.createServerClient.mock.calls[0]?.[2]).toMatchObject({
        global: {
          headers: { Authorization: "Bearer verified-owner-token" },
        },
      });
    }
  );

  it("does not forward request authorization by default", () => {
    const request = new Request("https://app.example/api/operations/schedule", {
      headers: { Authorization: "Bearer unforwarded-token" },
    });

    createRouteSupabaseClient(request, responseSink() as never, { noStore: true });

    expect(mocks.createServerClient.mock.calls[0]?.[2]).not.toMatchObject({
      global: { headers: expect.anything() },
    });
  });
});
