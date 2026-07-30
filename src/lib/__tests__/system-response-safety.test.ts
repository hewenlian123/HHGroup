import { afterEach, describe, expect, it } from "vitest";

import { redactSensitiveText } from "@/lib/system-response-safety";

const ORIGINAL_ENV = { ...process.env };

describe("system response secret redaction", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("redacts configured modern Supabase server secrets", () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_configured_test_value";

    expect(redactSensitiveText(`failure: ${process.env.SUPABASE_SECRET_KEY}`)).toBe(
      "failure: [redacted]"
    );
  });

  it("redacts modern secret-shaped values even when not present in process env", () => {
    const output = redactSensitiveText(
      "provider returned sb_secret_unconfigured_but_sensitive_value"
    );

    expect(output).not.toContain("sb_secret_");
    expect(output).toContain("[redacted-token]");
  });
});
