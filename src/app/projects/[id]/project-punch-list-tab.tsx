"use client";

import * as React from "react";
import Link from "next/link";
import { SectionHeader, Divider } from "@/components/base";
import { cn } from "@/lib/utils";

type PunchItem = {
  id: string;
  issue: string;
  location: string | null;
  worker_name: string | null;
  priority: string;
  status: string;
};

function normStatus(s: string): string {
  return s === "in_progress" ? "assigned" : s === "resolved" ? "completed" : s;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  assigned: "Assigned",
  completed: "Completed",
};

export function ProjectPunchListTab({
  projectId,
  punchItems,
}: {
  projectId: string;
  punchItems: PunchItem[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader label="Punch List" />
        <Link
          href={`/punch-list?project_id=${encodeURIComponent(projectId)}`}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          View full punch list →
        </Link>
      </div>
      <Divider />
      {punchItems.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No punch list issues for this project.</p>
      ) : (
        <div className="airtable-table-wrap airtable-table-wrap--ruled">
          <div className="airtable-table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Issue
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Location
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Assigned
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Priority
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {punchItems.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-[#F5F7FA] dark:hover:bg-muted/30"
                  >
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                      {r.issue || "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {r.location ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {r.worker_name ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                      {r.priority ?? "Medium"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                          normStatus(r.status) === "completed" &&
                            "bg-[#DCFCE7] text-[#166534] dark:bg-green-950 dark:text-green-300",
                          normStatus(r.status) === "assigned" &&
                            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          normStatus(r.status) === "open" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {STATUS_LABEL[normStatus(r.status)] ?? r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
