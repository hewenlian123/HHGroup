import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((url: string, anonKey: string, options: unknown) => ({
    anonKey,
    options,
    url,
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import { createBrowserClient } from "../supabase";

type SupabaseTestGlobal = typeof globalThis & {
  __hhBrowserSupabaseClients?: Map<string, unknown>;
  window?: unknown;
};

function testGlobal(): SupabaseTestGlobal {
  return globalThis as SupabaseTestGlobal;
}

describe("createBrowserClient", () => {
  beforeEach(() => {
    createClientMock.mockClear();
    delete testGlobal().__hhBrowserSupabaseClients;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    delete testGlobal().__hhBrowserSupabaseClients;
  });

  it("reuses one Supabase auth client in the browser for the same URL and anon key", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });

    const first = createBrowserClient("https://example.supabase.co", "anon-key");
    const second = createBrowserClient("https://example.supabase.co", "anon-key");

    expect(second).toBe(first);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock.mock.calls[0]?.[2]).toMatchObject({
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  });

  it("keeps separate browser clients for different Supabase credentials", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });

    const first = createBrowserClient("https://example.supabase.co", "anon-key");
    const second = createBrowserClient("https://example.supabase.co", "other-key");

    expect(second).not.toBe(first);
    expect(createClientMock).toHaveBeenCalledTimes(2);
  });

  it("does not reuse clients while running outside the browser", () => {
    Reflect.deleteProperty(globalThis, "window");

    const first = createBrowserClient("https://example.supabase.co", "anon-key");
    const second = createBrowserClient("https://example.supabase.co", "anon-key");

    expect(second).not.toBe(first);
    expect(createClientMock).toHaveBeenCalledTimes(2);
    expect(createClientMock.mock.calls[0]?.[2]).toMatchObject({
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  });
});
