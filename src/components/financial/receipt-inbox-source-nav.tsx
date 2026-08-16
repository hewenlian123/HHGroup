"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { workerReceiptInboxPath } from "@/lib/expense-operations-routing";
import { cn } from "@/lib/utils";

const sourceLinkClass =
  "inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium outline-none transition-colors duration-120 focus-visible:ring-2 focus-visible:ring-[var(--eo-focus)] focus-visible:ring-offset-1 md:min-h-9";

export function ReceiptInboxSourceNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workerActive = pathname.startsWith("/financial/inbox/worker");
  const projectId = searchParams.get("project_id")?.trim() || undefined;

  const expenseParams = new URLSearchParams();
  if (projectId) expenseParams.set("project_id", projectId);
  if (!workerActive) {
    for (const key of ["date_kind", "date_from", "date_to"] as const) {
      const value = searchParams.get(key)?.trim();
      if (value) expenseParams.set(key, value);
    }
  }
  const expenseQuery = expenseParams.toString();
  const expenseHref = expenseQuery ? `/financial/inbox?${expenseQuery}` : "/financial/inbox";
  const workerHref = workerReceiptInboxPath({
    project_id: projectId,
    workerId: workerActive ? (searchParams.get("workerId") ?? undefined) : undefined,
    status: workerActive ? (searchParams.get("status") ?? undefined) : undefined,
    date_from: workerActive ? (searchParams.get("date_from") ?? undefined) : undefined,
    date_to: workerActive ? (searchParams.get("date_to") ?? undefined) : undefined,
  });

  return (
    <nav
      aria-label="Receipt Inbox sources"
      className={cn(
        "flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg bg-[var(--eo-depth-structural)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <Link
        href={expenseHref}
        aria-current={!workerActive ? "page" : undefined}
        className={cn(
          sourceLinkClass,
          !workerActive
            ? "bg-[var(--eo-depth-l2)] text-[var(--eo-text-primary)] shadow-[var(--eo-shadow-operational)]"
            : "text-[var(--eo-text-secondary)] hover:bg-[var(--eo-depth-l3-hover)] hover:text-[var(--eo-text-primary)]"
        )}
      >
        Expense Uploads
      </Link>
      <Link
        href={workerHref}
        aria-current={workerActive ? "page" : undefined}
        className={cn(
          sourceLinkClass,
          workerActive
            ? "bg-[var(--eo-depth-l2)] text-[var(--eo-text-primary)] shadow-[var(--eo-shadow-operational)]"
            : "text-[var(--eo-text-secondary)] hover:bg-[var(--eo-depth-l3-hover)] hover:text-[var(--eo-text-primary)]"
        )}
      >
        Worker Submitted
      </Link>
    </nav>
  );
}
