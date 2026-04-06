"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { PageLayout, PageHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChangeOrder } from "@/lib/data";
import { cn } from "@/lib/utils";
import { listFlexRowClassName } from "@/lib/list-table-interaction";

export type ProjectGroup = {
  project: { id: string; name: string };
  changeOrders: ChangeOrder[];
};

function statusLabel(s: string): string {
  if (s === "Pending Approval") return "Pending";
  return s;
}

function statusClass(s: string): string {
  switch (s) {
    case "Draft":
      return "bg-[#f3f4f6] text-text-secondary";
    case "Pending Approval":
      return "bg-[#fff7ed] text-[#c2410c]";
    case "Approved":
      return "bg-[#f0fdf4] text-[#166534]";
    case "Rejected":
      return "bg-[#fef2f2] text-[#b91c1c]";
    default:
      return "bg-[#f3f4f6] text-text-secondary";
  }
}

function formatAmount(total: number, amount: number | null): string {
  const n = amount != null ? amount : total;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function ChangeOrdersView({
  projects,
  grouped,
  dataLoadWarning = null,
}: {
  projects: { id: string; name: string }[];
  grouped: ProjectGroup[];
  dataLoadWarning?: string | null;
}) {
  const router = useRouter();
  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  return (
    <PageLayout
      header={
        <PageHeader
          title="Change Orders"
          description={null}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="h-9 max-md:min-h-11 rounded-lg bg-[#111] text-white hover:bg-[#333] px-4 font-medium"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Change Order
                  <ChevronDown className="h-4 w-4 ml-2 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px] rounded-lg">
                {projects.length === 0 ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    No projects
                  </DropdownMenuItem>
                ) : (
                  projects.map((p) => (
                    <DropdownMenuItem key={p.id} asChild>
                      <Link href={`/projects/${p.id}/change-orders/new`}>{p.name}</Link>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      }
    >
      <div
        className="min-w-0 font-sans"
        style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
      >
        {dataLoadWarning ? (
          <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
            {dataLoadWarning}
          </p>
        ) : null}
        {grouped.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] text-text-secondary">
              {dataLoadWarning ? "Could not load change orders." : "No change orders yet."}
            </p>
            <p className="mt-1 text-sm text-[#9ca3af]">
              {dataLoadWarning
                ? "Check your connection and database configuration, then refresh."
                : "Create a project first, then add change orders from the project."}
            </p>
            {projects.length > 0 && (
              <Button
                asChild
                size="sm"
                className="mt-6 max-md:min-h-11 rounded-lg bg-[#111] text-white hover:bg-[#333]"
              >
                <Link href={`/projects/${projects[0].id}/change-orders/new`}>New Change Order</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {grouped.map(({ project, changeOrders }) => (
              <section key={project.id} className="space-y-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                  {project.name}
                </h2>
                <div className="rounded-lg overflow-hidden border border-[#eee]">
                  {changeOrders.map((co) => (
                    <Link
                      key={co.id}
                      href={`/projects/${co.projectId}/change-orders/${co.id}`}
                      className={cn(
                        listFlexRowClassName,
                        "flex min-h-11 items-center justify-between gap-4 border-b border-[#eee] px-5 py-4 last:border-b-0 max-md:flex-col max-md:items-stretch max-md:gap-3"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[#111] text-[15px]">{co.number}</div>
                        <div className="mt-0.5 truncate text-sm text-text-secondary">
                          {co.title || "Untitled"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-4 max-md:w-full">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${statusClass(co.status)}`}
                        >
                          {statusLabel(co.status)}
                        </span>
                        <span className="text-[15px] font-medium text-[#111] tabular-nums w-20 text-right">
                          {formatAmount(co.total, co.amount)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
