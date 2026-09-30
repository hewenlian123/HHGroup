import { describe, expect, it, vi } from "vitest";

import {
  isCompatibilityAccessEnabled,
  reportAuthRolloutConfig,
  resolveAuthRolloutConfig,
} from "@/lib/owner-access-mode";

describe("HH_REQUIRE_LOGIN rollout configuration", () => {
  it("defaults Production to compatibility while the product login gate is off", () => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin: "true",
      })
    ).toEqual({
      mode: "compatibility",
      runtime: "production",
      configurationState: "enabled",
    });
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
  });

  it.each(["0", "false", " FALSE "])(
    "%s records disabled configuration while login remains off",
    (requireLogin) => {
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
    }
  );

  it("keeps Production open when HH_REQUIRE_LOGIN is unset while login is off", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: undefined,
        allowLocal: undefined,
      })
    ).toBe(true);
  });

  it("keeps invalid configuration observable without reopening a login wall", () => {
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

  it("does not require HH_ALLOW_LOCAL_NO_LOGIN while the login gate is off", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "false",
        allowLocal: undefined,
      })
    ).toBe(true);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "false",
        allowLocal: "0",
      })
    ).toBe(true);
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
    expect(output).toContain("mode=compatibility");
    expect(output).toContain("runtime=production");
    expect(output).toContain("configuration=invalid");
    expect(output).toContain("temporary");
    expect(output).not.toContain("raw-invalid-value-must-not-appear");
  });
});
