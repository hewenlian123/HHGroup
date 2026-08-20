import { afterEach, describe, expect, it } from "vitest";

import { assertEstimateCertificationLocalOnly } from "../../../tests/e2e-supabase-url-guard";

const originalRemoteOverride = process.env.E2E_ALLOW_REMOTE_SUPABASE;

afterEach(() => {
  if (originalRemoteOverride === undefined) {
    delete process.env.E2E_ALLOW_REMOTE_SUPABASE;
  } else {
    process.env.E2E_ALLOW_REMOTE_SUPABASE = originalRemoteOverride;
  }
});

describe("Estimate local certification safety", () => {
  const localTarget = {
    baseURL: "http://localhost:3100",
    supabaseUrl: "http://127.0.0.1:54321",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  };

  it("accepts only the configured local app and Supabase endpoints", () => {
    expect(() => assertEstimateCertificationLocalOnly(localTarget)).not.toThrow();

    expect(() =>
      assertEstimateCertificationLocalOnly({
        ...localTarget,
        supabaseUrl: "https://rzublljldebswurgdqxp.supabase.co",
      })
    ).toThrow(/local Supabase API endpoint/i);

    expect(() =>
      assertEstimateCertificationLocalOnly({
        ...localTarget,
        supabaseUrl: "http://localhost:54320",
      })
    ).toThrow(/:54321/i);

    expect(() =>
      assertEstimateCertificationLocalOnly({
        ...localTarget,
        databaseUrl: "postgresql://postgres:postgres@localhost:54323/postgres",
      })
    ).toThrow(/:54322/i);

    expect(() =>
      assertEstimateCertificationLocalOnly({
        ...localTarget,
        baseURL: "https://hhprojectgroup.com",
      })
    ).toThrow(/local app URL/i);
  });

  it("rejects the remote-Supabase escape hatch for this certification", () => {
    process.env.E2E_ALLOW_REMOTE_SUPABASE = "1";

    expect(() => assertEstimateCertificationLocalOnly(localTarget)).toThrow(
      /does not permit E2E_ALLOW_REMOTE_SUPABASE/i
    );
  });
});
