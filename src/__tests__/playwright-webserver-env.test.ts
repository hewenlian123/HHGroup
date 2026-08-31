import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPlaywrightWebServerEnv } from "../../tests/e2e-webserver-env";

describe("Playwright web-server environment", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it("disables local auto-login and omits blank server keys for the spawned server", () => {
    const env = buildPlaywrightWebServerEnv({
      HH_ALLOW_LOCAL_AUTO_LOGIN: "1",
      NEXT_PUBLIC_SUPABASE_URL: " http://127.0.0.1:54321 ",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "  local-anon-key  ",
      SUPABASE_SECRET_KEY: "   ",
      SUPABASE_SERVICE_ROLE_KEY: "\t",
    });

    expect(env).toMatchObject({
      HH_ALLOW_LOCAL_AUTO_LOGIN: "0",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
    });
    expect(env).not.toHaveProperty("SUPABASE_SECRET_KEY");
    expect(env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("passes a disabled auto-login flag to the configured local web server", async () => {
    process.env.E2E_BASE_URL = "http://localhost:3000";
    process.env.E2E_WEB_SERVER = "";
    process.env.HH_ALLOW_LOCAL_AUTO_LOGIN = "1";
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");
    const webServer = config.webServer as { env: Record<string, string> };

    expect(webServer.env.HH_ALLOW_LOCAL_AUTO_LOGIN).toBe("0");
  });

  it("uses an isolated local port by default so browser sessions on the app port cannot pollute E2E", async () => {
    delete process.env.E2E_BASE_URL;
    process.env.E2E_WEB_SERVER = "";
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");
    const webServer = config.webServer as { url: string };

    expect(config.use?.baseURL).toBe("http://localhost:3001");
    expect(webServer.url).toBe("http://localhost:3001/financial/expenses");
    expect(process.env.E2E_BASE_URL).toBe("http://localhost:3001");
  });
});
