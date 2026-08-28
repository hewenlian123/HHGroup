import { describe, expect, it } from "vitest";

import { isMissingProjectsTable } from "@/lib/projects-db";
import { serverDataLoadWarning } from "@/lib/server-load-warning";

describe("projects error classification", () => {
  it("does not classify Postgres permission error 42501 as missing schema", () => {
    expect(
      isMissingProjectsTable({ code: "42501", message: "permission denied for table projects" })
    ).toBe(false);
    expect(
      serverDataLoadWarning(new Error("42501: permission denied for table projects"), "projects")
    ).toBe(
      "You do not have permission to load projects. Sign in with an authorized owner or admin account."
    );
  });

  it.each([
    [{ code: "42P01", message: 'relation "public.projects" does not exist' }],
    [
      {
        code: "PGRST205",
        message: "Could not find the table 'public.projects' in the schema cache",
      },
    ],
  ])("recognizes a genuine missing projects table", (error) => {
    expect(isMissingProjectsTable(error)).toBe(true);
  });
});
