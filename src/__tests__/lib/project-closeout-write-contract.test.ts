import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const source = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("Project Closeout canonical write contract", () => {
  it("persists saves only through the canonical closeout relations", () => {
    const closeout = source("src/lib/project-closeout-db.ts");

    expect(closeout).toContain('.rpc("replace_final_punch_list"');
    expect(closeout).toContain('.from("warranties")');
    expect(closeout).toContain('.from("completion_certificates")');
    expect(closeout).not.toMatch(/\.from\("project_closeout_(?:punch|warranty|completion)"\)/);
  });

  it("routes save through an authenticated server-side closeout client", () => {
    for (const route of [
      "src/app/api/projects/[id]/closeout/punch/route.ts",
      "src/app/api/projects/[id]/closeout/warranty/route.ts",
      "src/app/api/projects/[id]/closeout/completion/route.ts",
    ]) {
      const body = source(route);
      expect(body).toContain("requireSupabaseOwnerOrAdminRequestClient");
      expect(body).toContain("getServerSupabaseAdmin");
      expect(body.indexOf("requireSupabaseOwnerOrAdminRequestClient")).toBeLessThan(
        body.indexOf("getServerSupabaseAdmin()")
      );
      expect(body).toMatch(/parseCloseout(?:Punch|Warranty|Completion)Input/);
    }
  });
});
