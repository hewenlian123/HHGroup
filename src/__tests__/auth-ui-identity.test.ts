import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { authIdentityRoleLabel } from "@/components/auth/auth-ui";

describe("authenticated identity UI contract", () => {
  it("never represents an unauthenticated visitor as an application role", () => {
    expect(authIdentityRoleLabel(null, false)).toBe("Not signed in");
    expect(authIdentityRoleLabel("assistant", false)).toBe("Not signed in");
    expect(authIdentityRoleLabel(null, true)).toBe("Role unavailable");
    expect(authIdentityRoleLabel("assistant", true)).toBe("Assistant");
  });

  it("mounts AuthProvider in the root client provider chain", () => {
    const providers = readFileSync(resolve(process.cwd(), "src/app/providers.tsx"), "utf8");
    expect(providers).toContain('import { AuthProvider } from "@/components/auth/auth-provider"');
    expect(providers).toContain("<AuthProvider>{children}</AuthProvider>");
  });
});
