"use client";

import * as React from "react";
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
    : "h-7 rounded-sm text-xs";

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm",
        inbox
          ? "border-zinc-200/90 bg-zinc-50/98 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-zinc-50/92 dark:border-border/55 dark:bg-muted/95 dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]"
          : "border-border/60 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/90"
      )}
      role="region"
      aria-label="Bulk actions"
    >
      <span className="min-h-9 text-muted-foreground sm:min-h-0">
        <span className="font-medium text-foreground">{selectedCount}</span> selected
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "shrink-0 text-xs",
          inbox ? "h-10 min-h-10 min-w-10 sm:h-8 sm:min-h-0 sm:min-w-0" : "h-7"
        )}
        disabled={busy}
        onClick={onClear}
      >
        Clear
      </Button>
      <div className="mx-1 hidden h-4 w-px bg-border/80 sm:block" aria-hidden />
      {busy ? <SubmitSpinner loading className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}

      {inbox ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("shrink-0 shadow-none", controlSm)}
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
                className={cn("gap-1 shadow-none", controlSm)}
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
                className={cn("gap-1 shadow-none", controlSm)}
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
                className={cn("gap-1 shadow-none", controlSm)}
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
                className="h-7 gap-1 rounded-sm text-xs shadow-none"
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
                className="h-7 gap-1 rounded-sm text-xs shadow-none"
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
            className="h-7 shrink-0 rounded-sm border-red-200 text-xs text-red-700 shadow-none hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
            disabled={busy || selectedCount === 0}
            onClick={onDeleteMany}
          >
            Delete
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            disabled={busy || selectedCount === 0}
            onClick={onDownload}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </Button>
        </>
      )}
    </div>
  );
}
