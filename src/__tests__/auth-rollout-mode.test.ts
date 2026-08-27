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

  it.each(["0", "false", " FALSE "])(
    "%s cannot disable production authentication",
    (requireLogin) => {
      expect(
        resolveAuthRolloutConfig({
          runtime: "production",
          requireLogin,
        })
      ).toEqual({
        mode: "strict",
        runtime: "production",
        configurationState: "disabled",
      });
    }
  );

  it("fails closed in production when HH_REQUIRE_LOGIN is unset", () => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin: undefined,
      })
    ).toEqual({
      mode: "strict",
      runtime: "production",
      configurationState: "unset",
    });
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: undefined,
        allowLocal: undefined,
      })
    ).toBe(false);
  });

  it("fails closed for invalid production configuration while keeping it observable", () => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin: "unexpected-value",
      })
    ).toEqual({
      mode: "strict",
      runtime: "production",
      configurationState: "invalid",
    });
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "unexpected-value",
        allowLocal: undefined,
      })
    ).toBe(false);
  });

  it("fails closed in preview when HH_REQUIRE_LOGIN is unset", () => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "preview",
        requireLogin: undefined,
        allowLocal: "1",
      })
    ).toEqual({
      mode: "strict",
      runtime: "preview",
      configurationState: "unset",
    });
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

  it("does not let the local flag enable deployed compatibility mode", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "false",
        allowLocal: "0",
      })
    ).toBe(false);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "false",
        allowLocal: "1",
      })
    ).toBe(false);
  });

  it("allows local no-login only in development with the explicit local flag", () => {
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
        requireLogin: undefined,
        allowLocal: "1",
      })
    ).toBe(true);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "invalid",
        allowLocal: "1",
      })
    ).toBe(false);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "unknown",
        requireLogin: "false",
        allowLocal: undefined,
      })
    ).toBe(false);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "test",
        requireLogin: "false",
        allowLocal: "1",
      })
    ).toBe(false);
  });

  it("logs only the resolved fail-closed state for invalid configuration", () => {
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
    expect(output).toContain("mode=strict");
    expect(output).toContain("runtime=production");
    expect(output).toContain("configuration=invalid");
    expect(logger.warn).not.toHaveBeenCalled();
    expect(output).not.toContain("raw-invalid-value-must-not-appear");
  });
});
