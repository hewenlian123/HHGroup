"use client";

import * as React from "react";
import Link from "next/link";
import { SectionHeader, Divider } from "@/components/base";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

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
          className="text-hh-metadata font-medium text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
        >
          View full punch list →
        </Link>
      </div>
      <Divider />
      {punchItems.length === 0 ? (
        <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
          No punch list issues for this project.
        </p>
      ) : (
        <div className="airtable-table-wrap airtable-table-wrap--ruled">
          <div className="airtable-table-scroll">
            <table className="w-full text-hh-body">
              <thead>
                <tr>
                  <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Issue
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Location
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Assigned
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Priority
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {punchItems.map((r) => (
                  <tr key={r.id} className={listTableRowStaticClassName}>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium">
                      {r.issue || "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                      {r.location ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                      {r.worker_name ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell">
                      {r.priority ?? "Medium"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-hh-compact px-1.5 py-0.5 text-hh-metadata font-medium",
                          normStatus(r.status) === "completed" &&
                            "bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)] dark:bg-[var(--hh-success-soft-fill)] dark:text-[var(--hh-success)]",
                          normStatus(r.status) === "assigned" &&
                            "bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)] dark:bg-[var(--hh-warning-soft-fill)] dark:text-[var(--hh-warning)]",
                          normStatus(r.status) === "open" &&
                            "bg-muted text-[var(--hh-text-secondary)]"
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
