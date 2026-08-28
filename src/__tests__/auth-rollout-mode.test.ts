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
    "%s remains strict in Production while exposing stale configuration state",
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

  it("fails Production closed when HH_REQUIRE_LOGIN is unset", () => {
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

  it("fails Production closed while keeping invalid configuration observable", () => {
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

  it("does not let local compatibility flags change deployed strict mode", () => {
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

  it("lets real local auto-login disable the legacy no-session compatibility path", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "false",
        allowLocal: "1",
        allowAutoLogin: "1",
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
    expect(output).toContain("mode=strict");
    expect(output).toContain("runtime=production");
    expect(output).toContain("configuration=invalid");
    expect(output).not.toContain("temporary");
    expect(output).not.toContain("raw-invalid-value-must-not-appear");
  });
});
