import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getServerSupabaseAdminMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getServerSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: getServerSupabaseAdminMock,
}));

import { getPinStatus } from "@/lib/pin-auth";

describe("legacy PIN settings server access", () => {
  beforeEach(() => {
    const builder = {
      eq: vi.fn(),
      limit: vi.fn(),
      select: vi.fn(),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.limit.mockResolvedValue({
      data: [{ pin_hash: null, pin_salt: null, session_version: 3 }],
      error: null,
    });
    fromMock.mockReset().mockReturnValue(builder);
    getServerSupabaseAdminMock.mockReset().mockReturnValue({ from: fromMock });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("raw fetch must not run")))
    );
  });

  it("uses the shared server-only admin client instead of a secret Bearer header", async () => {
    await expect(getPinStatus()).resolves.toEqual({
      initialized: false,
      sessionVersion: 3,
      source: "supabase",
    });
    expect(fromMock).toHaveBeenCalledWith("app_security_settings");
    expect(fetch).not.toHaveBeenCalled();
  });
});
