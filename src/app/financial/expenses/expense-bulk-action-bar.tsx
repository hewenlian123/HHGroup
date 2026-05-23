"use client";

import * as React from "react";
import { NeoBulkActions } from "@/components/base";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { ChevronDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentAccountRow } from "@/lib/data";

type ProjectOpt = { id: string; name: string | null };

export type ExpenseBulkActionBarProps = {
  selectedCount: number;
  busy: boolean;
  pool: "inbox" | "expenses";
  projects: ProjectOpt[];
  categories: string[];
  paymentAccounts: PaymentAccountRow[];
  onClear: () => void;
  onMarkDone: () => void;
  onAssignProject: (projectId: string | null) => void;
  onSetCategory: (category: string) => void;
  onSetPayment: (paymentAccountId: string | null) => void;
  onDeleteMany: () => void;
  onDownload: () => void;
};

export function ExpenseBulkActionBar({
  selectedCount,
  busy,
  pool,
  projects,
  categories,
  paymentAccounts,
  onClear,
  onMarkDone,
  onAssignProject,
  onSetCategory,
  onSetPayment,
  onDeleteMany,
  onDownload,
}: ExpenseBulkActionBarProps) {
  const inbox = pool === "inbox";

  const controlSm = inbox
    ? "h-10 min-h-10 rounded-md px-3 text-xs sm:h-8 sm:min-h-0"
    : "h-7 rounded-md text-xs";

  return (
    <NeoBulkActions
      count={selectedCount}
      className={cn(
        "sticky top-0 z-30 rounded-none border-x-0 border-t-0 px-3 py-2 text-sm backdrop-blur-md",
        inbox ? "shadow-[var(--neo-shadow-panel)]" : "shadow-none"
      )}
      aria-label="Bulk actions"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "shrink-0 text-xs text-[var(--neo-text-secondary)] hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)]",
          inbox ? "h-10 min-h-10 min-w-10 sm:h-8 sm:min-h-0 sm:min-w-0" : "h-7"
        )}
        disabled={busy}
        onClick={onClear}
      >
        Clear
      </Button>
      <div className="mx-1 hidden h-4 w-px bg-[var(--neo-border)] sm:block" aria-hidden />
      {busy ? (
        <SubmitSpinner loading className="h-4 w-4 shrink-0 text-[var(--neo-text-secondary)]" />
      ) : null}

      {inbox ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "shrink-0 border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)]",
              controlSm
            )}
            disabled={busy || selectedCount === 0}
            onClick={onMarkDone}
          >
            Mark Done
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "gap-1 border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)]",
                  controlSm
                )}
                disabled={busy || selectedCount === 0}
              >
                Assign Project
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onSelect={() => onAssignProject(null)}
              >
                Overhead
              </DropdownMenuItem>
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  className="cursor-pointer text-xs"
                  onSelect={() => onAssignProject(p.id)}
                >
                  {(p.name ?? p.id).trim() || p.id}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "gap-1 border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)]",
                  controlSm
                )}
                disabled={busy || selectedCount === 0 || categories.length === 0}
              >
                Set Category
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-48 overflow-y-auto">
              {categories.map((c) => (
                <DropdownMenuItem
                  key={c}
                  className="cursor-pointer text-xs"
                  onSelect={() => onSetCategory(c)}
                >
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "gap-1 border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)]",
                  controlSm
                )}
                disabled={busy || selectedCount === 0 || paymentAccounts.length === 0}
              >
                Payment
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onSelect={() => onSetPayment(null)}
              >
                Clear payment account
              </DropdownMenuItem>
              {paymentAccounts.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  className="cursor-pointer text-xs"
                  onSelect={() => onSetPayment(a.id)}
                >
                  {a.name?.trim() || a.id}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 rounded-md border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-xs text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)]"
                disabled={busy || selectedCount === 0}
              >
                Edit Project
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onSelect={() => onAssignProject(null)}
              >
                Overhead
              </DropdownMenuItem>
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  className="cursor-pointer text-xs"
                  onSelect={() => onAssignProject(p.id)}
                >
                  {(p.name ?? p.id).trim() || p.id}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 rounded-md border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-xs text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)]"
                disabled={busy || selectedCount === 0 || categories.length === 0}
              >
                Edit Category
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-48 overflow-y-auto">
              {categories.map((c) => (
                <DropdownMenuItem
                  key={c}
                  className="cursor-pointer text-xs"
                  onSelect={() => onSetCategory(c)}
                >
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 rounded-md border-rose-500/25 bg-[var(--neo-surface-raised)] text-xs text-rose-300 shadow-none hover:bg-rose-500/10 hover:text-rose-200"
            disabled={busy || selectedCount === 0}
            onClick={onDeleteMany}
          >
            Delete
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-[var(--neo-text-secondary)] hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)]"
            disabled={busy || selectedCount === 0}
            onClick={onDownload}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </Button>
        </>
      )}
    </NeoBulkActions>
  );
}
