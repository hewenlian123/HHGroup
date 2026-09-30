import { describe, expect, it } from "vitest";

import { isLoginGateEnabled, LOGIN_GATE_ENABLED } from "@/lib/login-gate";
import {
  isCompatibilityAccessEnabled,
  resolveAuthRolloutConfig,
} from "@/lib/owner-access-mode";

describe("login gate product switch", () => {
  it("keeps the login gate off by default", () => {
    expect(LOGIN_GATE_ENABLED).toBe(false);
    expect(isLoginGateEnabled()).toBe(false);
  });

  it("opens compatibility access in Production while the login gate is off", () => {
    expect(
      resolveAuthRolloutConfig({
        runtime: "production",
        requireLogin: undefined,
      }).mode
    ).toBe("compatibility");
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: undefined,
        allowLocal: undefined,
      })
    ).toBe(true);
  });

  it("still disables no-session compatibility when local auto-login is selected", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "false",
        allowLocal: "1",
        allowAutoLogin: "1",
      })
    ).toBe(false);
  });
});
