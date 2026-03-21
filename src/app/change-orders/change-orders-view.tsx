"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { syncRouterAndClients } from "@/lib/sync-router-client";
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
      return "bg-[#f3f4f6] text-[#6b7280]";
    case "Pending Approval":
      return "bg-[#fff7ed] text-[#c2410c]";
    case "Approved":
      return "bg-[#f0fdf4] text-[#166534]";
    case "Rejected":
      return "bg-[#fef2f2] text-[#b91c1c]";
    default:
      return "bg-[#f3f4f6] text-[#6b7280]";
  }
}

function formatAmount(total: number, amount: number | null): string {
  const n = amount != null ? amount : total;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export function ChangeOrdersView({
  projects,
  grouped,
}: {
  projects: { id: string; name: string }[];
  grouped: ProjectGroup[];
}) {
  const router = useRouter();
  useOnAppSync(
    React.useCallback(() => {
      void syncRouterAndClients(router);
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
                  className="h-9 rounded-lg bg-[#111] text-white hover:bg-[#333] px-4 font-medium"
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
                      <Link href={`/projects/${p.id}/change-orders/new`}>
                        {p.name}
                      </Link>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      }
    >
      <div className="min-w-0 font-sans" style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}>
        {grouped.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] text-[#6b7280]">No change orders yet.</p>
            <p className="mt-1 text-sm text-[#9ca3af]">
              Create a project first, then add change orders from the project.
            </p>
            {projects.length > 0 && (
              <Button asChild size="sm" className="mt-6 rounded-lg bg-[#111] text-white hover:bg-[#333]">
                <Link href={`/projects/${projects[0].id}/change-orders/new`}>
                  New Change Order
                </Link>
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
                      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#fafafa] border-b border-[#eee] last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[#111] text-[15px]">
                          {co.number}
                        </div>
                        <div className="text-sm text-[#6b7280] truncate mt-0.5">
                          {co.title || "Untitled"}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
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
