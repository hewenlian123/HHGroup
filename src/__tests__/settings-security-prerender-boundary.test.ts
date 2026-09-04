import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Settings Security static prerender boundary", () => {
  it("keeps the server page chrome while deferring only the browser security workspace", () => {
    const page = source("src/app/settings/security/page.tsx");
    const clientBoundaryPath = resolve(
      process.cwd(),
      "src/app/settings/security/security-client-boundary.tsx"
    );

    expect(page).toContain('import { SecurityClientBoundary } from "./security-client-boundary";');
    expect(page).toContain("<PageLayout");
    expect(page).toContain("<PageHeader");
    expect(page).toContain("<SecurityClientBoundary />");

    expect(existsSync(clientBoundaryPath)).toBe(true);
    if (!existsSync(clientBoundaryPath)) return;
    const clientBoundary = readFileSync(clientBoundaryPath, "utf8");

    expect(clientBoundary).toContain('"use client";');
    expect(clientBoundary).toMatch(
      /dynamic\(\s*\(\) => import\("\.\/security-client"\)\.then\(\(module\) => module\.SecurityClient\),\s*\{\s*ssr: false/
    );
    expect(clientBoundary).toContain("<LoadingState");
  });
});
