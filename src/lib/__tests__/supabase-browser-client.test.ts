import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, createSsrBrowserClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((url: string, anonKey: string, options: unknown) => ({
    anonKey,
    options,
    url,
  })),
  createSsrBrowserClientMock: vi.fn((url: string, anonKey: string) => ({
    anonKey,
    storage: "cookie",
    url,
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createSsrBrowserClientMock,
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
    createSsrBrowserClientMock.mockClear();
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
    expect(createSsrBrowserClientMock).toHaveBeenCalledTimes(1);
    expect(createSsrBrowserClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key"
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("keeps separate browser clients for different Supabase credentials", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });

    const first = createBrowserClient("https://example.supabase.co", "anon-key");
    const second = createBrowserClient("https://example.supabase.co", "other-key");

    expect(second).not.toBe(first);
    expect(createSsrBrowserClientMock).toHaveBeenCalledTimes(2);
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
