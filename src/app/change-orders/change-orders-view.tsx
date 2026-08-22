"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { ChevronDown, FileStack, Plus } from "lucide-react";
import {
  EmptyState,
  NeoAmount,
  NeoInput,
  NeoPanel,
  NeoStatus,
  NeoToolbar,
  PageLayout,
  PageHeader,
  type StatusBadgeVariant,
} from "@/components/base";
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

function statusVariant(s: string): StatusBadgeVariant {
  switch (s) {
    case "Draft":
      return "muted";
    case "Pending Approval":
      return "warning";
    case "Approved":
      return "success";
    case "Rejected":
      return "danger";
    default:
      return "default";
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
            <Button size="sm" className="h-9 px-4">
              <Plus className="mr-2 h-4 w-4" />
              New Change Order
              <ChevronDown className="ml-2 h-4 w-4 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[220px] rounded-hh-standard border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] text-[var(--hh-text-primary)] shadow-floating"
          >
            {projects.length === 0 ? (
              <DropdownMenuItem disabled className="text-[var(--hh-text-secondary)]">
                No projects
              </DropdownMenuItem>
            ) : (
              projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  asChild
                  className="hover:bg-[var(--hh-l2-operational-surface)] focus:bg-[var(--hh-l2-operational-surface)]"
                >
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
        className="min-w-0 space-y-3 font-sans"
        style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
      >
        {grouped.length > 0 ? (
          <div className="md:hidden">
            <NeoInput
              placeholder="Search change orders…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 text-sm"
            />
          </div>
        ) : null}
        {grouped.length > 0 ? (
          <NeoToolbar className="hidden md:flex">
            <NeoInput
              placeholder="Search change orders…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 max-w-sm text-sm"
            />
          </NeoToolbar>
        ) : null}

        {dataLoadWarning ? (
          <p
            className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-hh-3 py-hh-2 text-hh-body text-[var(--hh-warning)]"
            role="status"
          >
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
            <EmptyState
              title={dataLoadWarning ? "Could not load change orders" : "No change orders yet"}
              description={
                dataLoadWarning
                  ? "Check your connection and database configuration, then refresh."
                  : "Create a project first, then add change orders from the project."
              }
              action={
                projects.length > 0 ? (
                  <Button asChild size="sm">
                    <Link href={`/projects/${projects[0].id}/change-orders/new`}>
                      New Change Order
                    </Link>
                  </Button>
                ) : undefined
              }
              className="hidden md:block"
            />
          </>
        ) : filteredGrouped.length === 0 ? (
          <EmptyState title="No matches" description="Try a different change order search." />
        ) : (
          <div className="space-y-3">
            {filteredGrouped.map(({ project, changeOrders }) => (
              <NeoPanel
                key={project.id}
                title={project.name}
                bodyClassName="divide-y divide-[var(--hh-border)]"
              >
                {changeOrders.map((co) => (
                  <Link
                    key={co.id}
                    href={`/projects/${co.projectId}/change-orders/${co.id}`}
                    className={cn(
                      listFlexRowClassName,
                      "group flex min-h-[64px] items-center justify-between gap-3 px-3 py-3 md:gap-4 md:px-4"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--hh-text-primary)]">
                        {co.number}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--hh-text-secondary)]">
                        {co.title || "Untitled"}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <NeoAmount className="text-sm">{formatAmount(co.total, co.amount)}</NeoAmount>
                      <NeoStatus
                        label={statusLabel(co.status)}
                        variant={statusVariant(co.status)}
                      />
                    </div>
                  </Link>
                ))}
              </NeoPanel>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
