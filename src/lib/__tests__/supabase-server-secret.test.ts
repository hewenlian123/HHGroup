import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ kind: "supabase-client" })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

const ORIGINAL_ENV = { ...process.env };

describe("server Supabase secret selection", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockClear();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://project.example.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-test-key",
    };
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("prefers the modern server secret without exposing it to public configuration", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_modern_test_value";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-service-role-test-value";
    const { getServerSupabaseAdmin } = await import("@/lib/supabase-server");

    expect(getServerSupabaseAdmin()).toBeTruthy();
    expect(createClientMock).toHaveBeenCalledWith(
      "https://project.example.test",
      "sb_secret_modern_test_value",
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
      })
    );
  });

  it("keeps a temporary legacy fallback for rollback readiness", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-service-role-test-value";
    const { getServerSupabaseAdmin } = await import("@/lib/supabase-server");

    expect(getServerSupabaseAdmin()).toBeTruthy();
    expect(createClientMock).toHaveBeenCalledWith(
      "https://project.example.test",
      "legacy-service-role-test-value",
      expect.any(Object)
    );
  });

  it("ignores an empty modern variable and uses the temporary legacy fallback", async () => {
    process.env.SUPABASE_SECRET_KEY = "   ";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-service-role-test-value";
    const { getServerSupabaseAdmin } = await import("@/lib/supabase-server");

    expect(getServerSupabaseAdmin()).toBeTruthy();
    expect(createClientMock).toHaveBeenCalledWith(
      "https://project.example.test",
      "legacy-service-role-test-value",
      expect.any(Object)
    );
  });
});
