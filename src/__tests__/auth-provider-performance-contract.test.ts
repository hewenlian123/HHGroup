import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("AuthProvider performance contract", () => {
  it("uses the guaranteed INITIAL_SESSION event instead of starting a duplicate auth load", () => {
    const authProvider = source("src/components/auth/auth-provider.tsx");

    expect(authProvider).not.toContain(
      "    void loadAuthState();\n    const { data: sub } = supabase.auth.onAuthStateChange"
    );
    expect(authProvider).toContain("supabase.auth.onAuthStateChange");
  });
});
