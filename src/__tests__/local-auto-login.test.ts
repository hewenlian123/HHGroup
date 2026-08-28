import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { isLoopbackHostname, resolveLocalAutoLoginAvailability } from "@/lib/local-auto-login";

const LOCAL_OPTIONS = {
  flag: "1",
  nodeEnv: "development",
  requestUrl: "http://localhost:3000/projects",
  supabaseUrl: "http://127.0.0.1:54321",
  vercelEnv: undefined,
};

describe("local auto-login safety contract", () => {
  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])(
    "recognizes loopback hostname %s",
    (hostname) => {
      expect(isLoopbackHostname(hostname)).toBe(true);
    }
  );

  it("requires the explicit flag and all local development boundaries", () => {
    expect(resolveLocalAutoLoginAvailability(LOCAL_OPTIONS)).toEqual({ enabled: true });
    expect(resolveLocalAutoLoginAvailability({ ...LOCAL_OPTIONS, flag: "0" })).toMatchObject({
      enabled: false,
      reason: "disabled",
    });
    expect(
      resolveLocalAutoLoginAvailability({ ...LOCAL_OPTIONS, nodeEnv: "production" })
    ).toMatchObject({ enabled: false, reason: "non-development-runtime" });
    expect(
      resolveLocalAutoLoginAvailability({ ...LOCAL_OPTIONS, vercelEnv: "preview" })
    ).toMatchObject({ enabled: false, reason: "deployed-runtime" });
  });

  it("rejects non-loopback requests and Supabase projects", () => {
    expect(
      resolveLocalAutoLoginAvailability({
        ...LOCAL_OPTIONS,
        requestUrl: "https://hhprojectgroup.com/projects",
      })
    ).toMatchObject({ enabled: false, reason: "non-local-request" });
    expect(
      resolveLocalAutoLoginAvailability({
        ...LOCAL_OPTIONS,
        supabaseUrl: "https://example.supabase.co",
      })
    ).toMatchObject({ enabled: false, reason: "non-local-supabase" });
  });

  it("fails a Vercel Production build when the local-only flag is present", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        "import nextConfig from './next.config.mjs'; nextConfig();",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HH_ALLOW_LOCAL_AUTO_LOGIN: "1",
          VERCEL_ENV: "production",
        },
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("HH_ALLOW_LOCAL_AUTO_LOGIN is local-development only");
  });
});
