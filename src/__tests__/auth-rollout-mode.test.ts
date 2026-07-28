import { describe, expect, it, vi } from "vitest";

import {
  isCompatibilityAccessEnabled,
  reportAuthRolloutConfig,
  resolveAuthRolloutConfig,
} from "@/lib/owner-access-mode";

describe("HH_REQUIRE_LOGIN rollout configuration", () => {
  it.each(["1", "true", " TRUE "])("%s enables strict authentication", (requireLogin) => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin,
      })
    ).toEqual({
      mode: "strict",
      runtime: "production",
      configurationState: "enabled",
    });
  });

  it.each(["0", "false", " FALSE "])("%s enables compatibility mode", (requireLogin) => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin,
      })
    ).toEqual({
      mode: "compatibility",
      runtime: "production",
      configurationState: "disabled",
    });
  });

  it("keeps production in compatibility mode when HH_REQUIRE_LOGIN is unset", () => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin: undefined,
      })
    ).toEqual({
      mode: "compatibility",
      runtime: "production",
      configurationState: "unset",
    });
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: undefined,
        allowLocal: undefined,
      })
    ).toBe(true);
  });

  it("keeps invalid production configuration observable without locking users out", () => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin: "unexpected-value",
      })
    ).toEqual({
      mode: "compatibility",
      runtime: "production",
      configurationState: "invalid",
    });
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "unexpected-value",
        allowLocal: undefined,
      })
    ).toBe(true);
  });

  it("gives strict mode precedence over local compatibility flags", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "true",
        allowLocal: "1",
      })
    ).toBe(false);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "1",
        allowLocal: "1",
      })
    ).toBe(false);
  });

  it("does not let the local flag independently change deployed compatibility mode", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "false",
        allowLocal: "0",
      })
    ).toBe(true);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "false",
        allowLocal: "1",
      })
    ).toBe(true);
  });

  it("allows local no-login only in compatibility mode with the explicit local flag", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "false",
        allowLocal: "1",
      })
    ).toBe(true);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "false",
        allowLocal: undefined,
      })
    ).toBe(false);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "test",
        requireLogin: undefined,
        allowLocal: "0",
      })
    ).toBe(false);
  });

  it("logs only resolved state and a temporary compatibility warning", () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    reportAuthRolloutConfig(
      {
        runtime: "production",
        requireLogin: "raw-invalid-value-must-not-appear",
      },
      logger
    );

    const output = JSON.stringify({
      info: logger.info.mock.calls,
      warn: logger.warn.mock.calls,
    });
    expect(output).toContain("mode=compatibility");
    expect(output).toContain("runtime=production");
    expect(output).toContain("configuration=invalid");
    expect(output).toContain("temporary");
    expect(output).not.toContain("raw-invalid-value-must-not-appear");
  });
});
