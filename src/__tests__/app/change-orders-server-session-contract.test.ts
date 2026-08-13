import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src", "app", "change-orders", "page.tsx"), "utf8");

describe("Change Orders server session contract", () => {
  it("uses the authenticated request client for the project list and change-order reads", () => {
    expect(source).toContain('import { createServerSupabaseClient } from "@/lib/supabase-server"');
    expect(source).toContain(
      "const projectSupabase = await createServerSupabaseClient({ noStore: true });"
    );
    expect(source).toContain("projects = await getProjects(projectSupabase);");
    expect(source).toContain("getChangeOrdersByProject(p.id, projectSupabase)");
    expect(source).not.toContain("projects = await getProjects();");
  });
});
