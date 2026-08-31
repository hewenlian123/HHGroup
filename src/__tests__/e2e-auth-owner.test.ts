import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authAdmin = vi.hoisted(() => ({
  createUser: vi.fn(),
  listUsers: vi.fn(),
  updateUserById: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { admin: authAdmin } })),
}));

import { createClient } from "@supabase/supabase-js";
import * as ownerAuth from "../../tests/e2e-auth-owner";

describe("E2E Auth owner lifecycle", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.E2E_AUTH_OWNER_EMAIL = "owner@example.invalid";
    process.env.E2E_AUTH_OWNER_PASSWORD = "Local-owner-password";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local-service-role-key";
    vi.mocked(createClient).mockClear();
    authAdmin.createUser.mockReset();
    authAdmin.listUsers.mockReset();
    authAdmin.updateUserById.mockReset();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("uses an existing owner for ordinary credential lookup without resetting its password", async () => {
    authAdmin.listUsers.mockResolvedValue({
      data: { users: [{ email: "OWNER@example.invalid", id: "existing-owner-id" }] },
      error: null,
    });
    authAdmin.updateUserById.mockResolvedValue({ data: {}, error: null });

    await expect(ownerAuth.ensureE2EOwner()).resolves.toBe("existing-owner-id");

    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it("uses the modern Supabase server secret when the legacy key is absent", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SECRET_KEY = "local-modern-secret-key";
    authAdmin.listUsers.mockResolvedValue({
      data: { users: [{ email: "owner@example.invalid", id: "existing-owner-id" }] },
      error: null,
    });

    await expect(ownerAuth.ensureE2EOwner()).resolves.toBe("existing-owner-id");

    expect(createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "local-modern-secret-key",
      expect.any(Object)
    );
  });

  it("provisions each existing E2E role with one explicit run-level credential reset", async () => {
    authAdmin.listUsers.mockResolvedValue({
      data: {
        users: [
          { email: "owner@example.invalid", id: "existing-owner-id" },
          {
            email: "e2e-auth-assistant-82d723c52f1b91a8@example.invalid",
            id: "existing-assistant-id",
          },
        ],
      },
      error: null,
    });
    authAdmin.updateUserById.mockResolvedValue({ data: {}, error: null });
    const provision = (
      ownerAuth as typeof ownerAuth & { provisionE2EAuthUsersForRun?: () => Promise<void> }
    ).provisionE2EAuthUsersForRun;

    expect(provision).toBeTypeOf("function");
    await provision?.();

    expect(authAdmin.updateUserById).toHaveBeenCalledTimes(2);
    expect(authAdmin.updateUserById).toHaveBeenNthCalledWith(1, "existing-owner-id", {
      app_metadata: { role: "owner" },
      email_confirm: true,
      password: "Local-owner-password",
    });
    expect(authAdmin.updateUserById).toHaveBeenNthCalledWith(2, "existing-assistant-id", {
      app_metadata: { role: "assistant" },
      email_confirm: true,
      password: "Hh!95b71f588546b62d78b8eba782bcaA1",
    });
  });

  it("offers an explicit owner-only password reset for password lifecycle cleanup", async () => {
    authAdmin.listUsers.mockResolvedValue({
      data: { users: [{ email: "owner@example.invalid", id: "existing-owner-id" }] },
      error: null,
    });
    authAdmin.updateUserById.mockResolvedValue({ data: {}, error: null });
    const resetOwner = (
      ownerAuth as typeof ownerAuth & { resetE2EOwnerPassword?: () => Promise<void> }
    ).resetE2EOwnerPassword;

    expect(resetOwner).toBeTypeOf("function");
    await resetOwner?.();

    expect(authAdmin.updateUserById).toHaveBeenCalledOnce();
    expect(authAdmin.updateUserById).toHaveBeenCalledWith("existing-owner-id", {
      app_metadata: { role: "owner" },
      email_confirm: true,
      password: "Local-owner-password",
    });
  });

  it("pins hard-navigation matching to the configured origin and exact destination", async () => {
    process.env.E2E_BASE_URL = "http://127.0.0.1:3001";
    let currentURL = "http://127.0.0.1:3001/estimates/current";
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto: vi.fn(async (destination: string) => {
        currentURL = new URL(destination, process.env.E2E_BASE_URL).href;
      }),
      url: vi.fn(() => currentURL),
      waitForLoadState,
      waitForResponse: vi.fn(async (predicate: (response: { url: () => string }) => boolean) => {
        const response = {
          ok: () => true,
          status: () => 200,
          statusText: () => "OK",
          url: () => "http://127.0.0.1:54321/auth/v1/user",
        };
        expect(predicate(response)).toBe(true);
        return response;
      }),
      waitForURL: vi.fn(async (predicate: (url: URL) => boolean) => {
        currentURL = "https://malicious.example/estimates/next";
        expect(predicate(new URL(currentURL))).toBe(false);
        currentURL = "http://127.0.0.1:3001/estimates/next?unexpected=1";
        expect(predicate(new URL(currentURL))).toBe(false);
        currentURL = "http://127.0.0.1:3001/estimates/next";
        expect(predicate(new URL(currentURL))).toBe(true);
      }),
    };

    await ownerAuth.gotoWithE2EAuth(
      page as unknown as Parameters<typeof ownerAuth.gotoWithE2EAuth>[0],
      "/estimates/next"
    );

    expect(waitForLoadState).toHaveBeenCalledTimes(2);
    expect(waitForLoadState).toHaveBeenNthCalledWith(1, "networkidle");
    expect(waitForLoadState).toHaveBeenNthCalledWith(2, "networkidle");
  });

  it("drains the current page before an authenticated reload", async () => {
    process.env.E2E_BASE_URL = "http://127.0.0.1:3001";
    const currentURL = "http://127.0.0.1:3001/estimates/current?tab=payment#schedule";
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const page = {
      reload: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => currentURL),
      waitForLoadState,
      waitForResponse: vi.fn(async (predicate: (response: { url: () => string }) => boolean) => {
        const response = {
          ok: () => true,
          status: () => 200,
          statusText: () => "OK",
          url: () => "http://127.0.0.1:54321/auth/v1/user",
        };
        expect(predicate(response)).toBe(true);
        return response;
      }),
      waitForURL: vi.fn(async (predicate: (url: URL) => boolean) => {
        expect(predicate(new URL(currentURL))).toBe(true);
      }),
    };

    await ownerAuth.reloadWithE2EAuth(
      page as unknown as Parameters<typeof ownerAuth.reloadWithE2EAuth>[0]
    );

    expect(waitForLoadState).toHaveBeenCalledTimes(2);
    expect(waitForLoadState).toHaveBeenNthCalledWith(1, "networkidle");
    expect(waitForLoadState).toHaveBeenNthCalledWith(2, "networkidle");
  });
});
