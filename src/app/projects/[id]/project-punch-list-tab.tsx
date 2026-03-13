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
        <div className="border border-border/60 rounded-sm overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Issue</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Location</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Assigned</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {punchItems.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40">
                  <td className="py-2 px-3 font-medium">{r.issue || "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.location ?? "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.worker_name ?? "—"}</td>
                  <td className="py-2 px-3">{r.priority ?? "Medium"}</td>
                  <td className="py-2 px-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                        normStatus(r.status) === "completed" && "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
                        normStatus(r.status) === "assigned" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
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
      )}
    </div>
  );
}
