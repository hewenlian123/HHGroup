import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

const {
  adminCreateUserMock,
  adminListUsersMock,
  adminUpdateUserMock,
  createClientMock,
  createRouteSupabaseClientMock,
  execFileMock,
  fallbackListUsersMock,
  getServerSupabaseAdminNoStoreMock,
  signInWithPasswordMock,
  signOutMock,
} = vi.hoisted(() => ({
  adminCreateUserMock: vi.fn(),
  adminListUsersMock: vi.fn(),
  adminUpdateUserMock: vi.fn(),
  createClientMock: vi.fn(),
  createRouteSupabaseClientMock: vi.fn(),
  execFileMock: vi.fn(),
  fallbackListUsersMock: vi.fn(),
  getServerSupabaseAdminNoStoreMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFile: execFileMock }));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: createRouteSupabaseClientMock,
  getServerSupabaseAdminNoStore: getServerSupabaseAdminNoStoreMock,
}));

import { GET } from "@/app/api/auth/local-auto-login/route";

const ORIGINAL_ENV = { ...process.env };
const OWNER_ID = "11111111-1111-4111-8111-111111111111";

function localServiceRoleToken(): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256", kid: "local-test-key", typ: "JWT" })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 300,
    role: "service_role",
  })}.test-signature`;
}

describe("GET /api/auth/local-auto-login", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      HH_ALLOW_LOCAL_AUTO_LOGIN: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon",
      NODE_ENV: "development",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-secret",
    };
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.VERCEL_ENV;

    adminCreateUserMock.mockReset().mockResolvedValue({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
    adminListUsersMock.mockReset().mockResolvedValue({ data: { users: [] }, error: null });
    adminUpdateUserMock.mockReset();
    fallbackListUsersMock.mockReset().mockResolvedValue({ data: { users: [] }, error: null });
    createClientMock.mockReset().mockReturnValue({
      auth: {
        admin: {
          createUser: adminCreateUserMock,
          listUsers: fallbackListUsersMock,
          updateUserById: adminUpdateUserMock,
        },
      },
    });
    execFileMock.mockReset().mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout: string) => void;
      callback(null, localServiceRoleToken());
    });
    signInWithPasswordMock.mockReset().mockImplementation(async ({ email }) => ({
      data: { user: { id: OWNER_ID, email, app_metadata: { role: "owner" } } },
      error: null,
    }));
    signOutMock.mockReset().mockResolvedValue({ error: null });
    getServerSupabaseAdminNoStoreMock.mockReset().mockReturnValue({
      auth: {
        admin: {
          createUser: adminCreateUserMock,
          listUsers: adminListUsersMock,
          updateUserById: adminUpdateUserMock,
        },
      },
    });
    createRouteSupabaseClientMock.mockReset().mockReturnValue({
      auth: { signInWithPassword: signInWithPasswordMock, signOut: signOutMock },
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("creates a real local owner and returns a server-established session redirect", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/auth/local-auto-login?redirect=%2Fprojects")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/projects");
    expect(adminCreateUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ app_metadata: { role: "owner" }, email_confirm: true })
    );
    expect(signInWithPasswordMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.stringMatching(/@example\.invalid$/) })
    );
    expect(JSON.stringify([...response.headers])).not.toContain("local-service-secret");
  });

  it("accepts the canonical owner session when Auth obscures a duplicate create response ID", async () => {
    signInWithPasswordMock.mockImplementationOnce(async ({ email }) => ({
      data: {
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          email,
          app_metadata: { role: "owner" },
        },
      },
      error: null,
    }));

    const response = await GET(
      new NextRequest("http://localhost:3000/api/auth/local-auto-login?redirect=%2Fprojects")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/projects");
  });

  it.each([
    ["Production", { NODE_ENV: "production", VERCEL_ENV: "production" }],
    ["Preview", { NODE_ENV: "production", VERCEL_ENV: "preview" }],
  ])("is unavailable in %s even when the flag is set", async (_, runtime) => {
    Object.assign(process.env, runtime);

    const response = await GET(
      new NextRequest("https://hhprojectgroup.com/api/auth/local-auto-login")
    );

    expect(response.status).toBe(404);
    expect(getServerSupabaseAdminNoStoreMock).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("falls back to a short-lived local ES256 service token when legacy admin JWT is rejected", async () => {
    adminListUsersMock.mockResolvedValue({
      data: { users: [] },
      error: { code: "bad_jwt", message: "signing method HS256 is invalid" },
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/auth/local-auto-login?redirect=%2Fdashboard")
    );

    expect(response.status).toBe(307);
    expect(execFileMock).toHaveBeenCalledWith(
      "supabase",
      ["gen", "bearer-jwt", "--role", "service_role", "--valid-for", "5m", "-o", "json"],
      expect.objectContaining({ cwd: process.cwd(), encoding: "utf8", timeout: 15_000 }),
      expect.any(Function)
    );
    const execOptions = execFileMock.mock.calls[0]?.[2] as { shell?: unknown };
    expect(execOptions.shell).toBeUndefined();
    expect(fallbackListUsersMock).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(createClientMock).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      expect.stringMatching(/^eyJ[^.]+\.[^.]+\.[^.]+$/),
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) })
    );
  });

  it("checks the local-only guard before constructing the privileged client", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/auth/local-auto-login/route.ts"),
      "utf8"
    );
    expect(source.indexOf("isLocalAutoLoginEnabled(request.url)")).toBeLessThan(
      source.indexOf("await ensureLocalOwner()")
    );
    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_SECRET_KEY");
  });
});
