"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

type ExpenseOperationsSurface = "expenses" | "inbox" | "reimbursements";

const SURFACES: Array<{
  id: ExpenseOperationsSurface;
  label: string;
  pathname: string;
}> = [
  { id: "expenses", label: "Expenses", pathname: "/financial/expenses" },
  { id: "inbox", label: "Receipt Inbox", pathname: "/financial/inbox" },
  { id: "reimbursements", label: "Reimbursements", pathname: "/labor/reimbursements" },
];

function surfaceForPathname(pathname: string): ExpenseOperationsSurface | null {
  return SURFACES.find((surface) => pathname.startsWith(surface.pathname))?.id ?? null;
}

function isExpenseRecordSurface(surface: ExpenseOperationsSurface | null): boolean {
  return surface === "expenses" || surface === "inbox";
}

export function ExpenseOperationsWorkspaceNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSurface = surfaceForPathname(pathname);
  const workerInboxActive = pathname.startsWith("/financial/inbox/worker");

  const hrefFor = (target: (typeof SURFACES)[number]) => {
    const next = new URLSearchParams();
    const workerId = searchParams.get("workerId")?.trim();
    const targetUsesWorkerInbox =
      target.id === "inbox" &&
      (workerInboxActive || (activeSurface === "reimbursements" && Boolean(workerId)));
    const targetPathname = targetUsesWorkerInbox ? "/financial/inbox/worker" : target.pathname;

    if (
      isExpenseRecordSurface(activeSurface) &&
      isExpenseRecordSurface(target.id) &&
      !workerInboxActive &&
      !targetUsesWorkerInbox
    ) {
      for (const key of ["date_kind", "date_from", "date_to"] as const) {
        const value = searchParams.get(key)?.trim();
        if (value) next.set(key, value);
      }
    }

    const projectId = searchParams.get("project_id")?.trim();
    if (projectId) next.set("project_id", projectId);

    if (
      workerId &&
      ((workerInboxActive && (target.id === "inbox" || target.id === "reimbursements")) ||
        (activeSurface === "reimbursements" && targetUsesWorkerInbox))
    ) {
      next.set("workerId", workerId);
    }

    if (workerInboxActive && targetUsesWorkerInbox) {
      for (const key of ["status", "date_from", "date_to"] as const) {
        const value = searchParams.get(key)?.trim();
        if (value) next.set(key, value);
      }
    }

    const query = next.toString();
    return query ? `${targetPathname}?${query}` : targetPathname;
  };

  return (
    <section
      data-expense-operations-shell
      className={cn(
        "min-w-0 shrink-0 border-b border-[var(--eo-border,var(--neo-border))] pb-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold leading-tight tracking-normal text-[var(--eo-text-primary,var(--neo-text-primary))] md:text-[19px]">
            Expense Operations
          </h1>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--eo-text-secondary,var(--neo-text-secondary))]">
            Daily operational workspace
          </p>
        </div>
        <nav
          aria-label="Expense Operations workspace"
          className="-mx-1 flex min-w-0 max-w-full gap-1 overflow-x-auto px-1 pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SURFACES.map((surface) => {
            const active = surface.id === activeSurface;
            return (
              <Link
                key={surface.id}
                href={hrefFor(surface)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-medium outline-none transition-colors duration-120 md:min-h-9",
                  "focus-visible:ring-2 focus-visible:ring-[var(--eo-focus,var(--neo-gold-ring))] focus-visible:ring-offset-1",
                  active
                    ? "bg-[var(--eo-selected,var(--neo-surface-muted))] text-[var(--eo-text-primary,var(--neo-text-primary))]"
                    : "text-[var(--eo-text-secondary,var(--neo-text-secondary))] hover:bg-[var(--eo-hover,var(--neo-surface-muted))] hover:text-[var(--eo-text-primary,var(--neo-text-primary))]"
                )}
              >
                {surface.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
