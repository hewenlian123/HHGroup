"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { ChevronDown, FileStack, Plus } from "lucide-react";
import { PageLayout, PageHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChangeOrder } from "@/lib/data";
import { cn } from "@/lib/utils";
import { listFlexRowClassName } from "@/lib/list-table-interaction";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

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
  const [search, setSearch] = React.useState("");
  const [newOpen, setNewOpen] = React.useState(false);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const filteredGrouped = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        changeOrders: g.changeOrders.filter(
          (co) =>
            co.number.toLowerCase().includes(q) ||
            (co.title ?? "").toLowerCase().includes(q) ||
            g.project.name.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.changeOrders.length > 0);
  }, [grouped, search]);

  const desktopHeader = (
    <PageHeader
      title="Change Orders"
      description={null}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-9 rounded-lg bg-[#111] px-4 font-medium text-white hover:bg-[#333]"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Change Order
              <ChevronDown className="ml-2 h-4 w-4 opacity-80" />
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
  );

  return (
    <PageLayout
      divider={false}
      className={cn(mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <>
          <div className="hidden w-full md:block">{desktopHeader}</div>
          <div className="md:hidden">
            <MobileListHeader
              title="Change Orders"
              fab={
                <MobileFabButton ariaLabel="New change order" onClick={() => setNewOpen(true)} />
              }
            />
          </div>
        </>
      }
    >
      <MobileFilterSheet open={newOpen} onOpenChange={setNewOpen} title="New change order">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a project first.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {projects.map((p) => (
              <Button key={p.id} variant="ghost" className="h-10 justify-start rounded-sm" asChild>
                <Link
                  href={`/projects/${p.id}/change-orders/new`}
                  onClick={() => setNewOpen(false)}
                >
                  {p.name}
                </Link>
              </Button>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-sm"
          onClick={() => setNewOpen(false)}
        >
          Cancel
        </Button>
      </MobileFilterSheet>

      <div
        className="min-w-0 space-y-3 font-sans md:space-y-0"
        style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
      >
        {grouped.length > 0 ? (
          <div className="md:hidden">
            <Input
              placeholder="Search change orders…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 text-sm"
            />
          </div>
        ) : null}
        {grouped.length > 0 ? (
          <div className="hidden md:block">
            <Input
              placeholder="Search change orders…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 max-w-sm text-sm"
            />
          </div>
        ) : null}

        {dataLoadWarning ? (
          <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
            {dataLoadWarning}
          </p>
        ) : null}

        {grouped.length === 0 ? (
          <>
            <MobileEmptyState
              icon={<FileStack className="h-8 w-8 opacity-80" aria-hidden />}
              message={
                dataLoadWarning
                  ? "Could not load change orders."
                  : "No change orders yet. Add a project, then create a change order."
              }
              action={
                projects.length > 0 && !dataLoadWarning ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/projects/${projects[0].id}/change-orders/new`}>
                      New change order
                    </Link>
                  </Button>
                ) : undefined
              }
            />
            <div className="hidden py-24 text-center md:block">
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
                  className="mt-6 rounded-lg bg-[#111] text-white hover:bg-[#333]"
                >
                  <Link href={`/projects/${projects[0].id}/change-orders/new`}>
                    New Change Order
                  </Link>
                </Button>
              )}
            </div>
          </>
        ) : filteredGrouped.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          <div className="space-y-8 md:space-y-12">
            {filteredGrouped.map(({ project, changeOrders }) => (
              <section key={project.id} className="space-y-2 md:space-y-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                  {project.name}
                </h2>
                <div className="overflow-hidden rounded-lg border border-[#eee] max-md:rounded-none max-md:border-0 dark:border-border/60">
                  <div className="divide-y divide-gray-100 dark:divide-border/60">
                    {changeOrders.map((co) => (
                      <Link
                        key={co.id}
                        href={`/projects/${co.projectId}/change-orders/${co.id}`}
                        className={cn(
                          listFlexRowClassName,
                          "flex min-h-[56px] items-center justify-between gap-3 px-0 py-2.5 md:gap-4 md:px-5 md:py-4"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[#111] dark:text-foreground">
                            {co.number}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-text-secondary dark:text-muted-foreground">
                            {co.title || "Untitled"}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-medium tabular-nums text-[#111] dark:text-foreground">
                            {formatAmount(co.total, co.amount)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusClass(co.status)}`}
                          >
                            {statusLabel(co.status)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
