import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getAllTasksWithProject } from "@/lib/project-tasks-db";

describe("task session enrichment", () => {
  it.each(["projects", "workers"])(
    "fails closed when %s names are unavailable",
    async (failedTable) => {
      const client = {
        from(table: string) {
          const result =
            table === "project_tasks"
              ? {
                  data: [
                    {
                      id: "task",
                      project_id: "project",
                      title: "Scope test",
                      assigned_worker_id: "worker",
                    },
                  ],
                  error: null,
                }
              : table === failedTable
                ? { data: null, error: { message: "unavailable" } }
                : { data: [], error: null };
          const query = { select: () => query, order: async () => result, in: async () => result };
          return query;
        },
      } as unknown as SupabaseClient;
      await expect(getAllTasksWithProject(client)).rejects.toThrow(
        "Task project and worker names are unavailable"
      );
    }
  );
});
