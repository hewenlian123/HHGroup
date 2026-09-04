import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAllScheduleWithProject } from "@/lib/project-schedule-db";

describe("project schedule project-list reuse", () => {
  it("uses the handler's project list for schedule names without another projects query", async () => {
    const tables: string[] = [];
    const client = {
      from(table: string) {
        tables.push(table);
        const result = Promise.resolve({
          data:
            table === "project_schedule"
              ? [
                  {
                    id: "schedule-1",
                    project_id: "project-1",
                    title: "Permit",
                    start_date: "2026-09-03",
                    end_date: null,
                    status: "planned",
                    created_at: "2026-09-03T00:00:00.000Z",
                  },
                ]
              : [],
          error: null,
        });
        const builder = {
          select: () => builder,
          order: () => builder,
          in: () => builder,
          then: result.then.bind(result),
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    await expect(
      getAllScheduleWithProject(
        client,
        Promise.resolve([{ id: "project-1", name: "Harbor House" }])
      )
    ).resolves.toEqual([
      expect.objectContaining({ id: "schedule-1", project_name: "Harbor House" }),
    ]);
    expect(tables).toEqual(["project_schedule"]);
  });
});
