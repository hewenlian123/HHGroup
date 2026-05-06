"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import type { AdvanceRow } from "./worker-advances-client";

type Props = {
  advance: AdvanceRow;
  onEdit: () => void;
  onMarkDeducted: () => void;
  onDelete: () => void;
  disabled?: boolean;
  layout?: "desktop" | "mobile";
};

export function WorkerAdvanceActionsMenu({
  advance,
  onEdit,
  onMarkDeducted,
  onDelete,
  disabled,
  layout = "desktop",
}: Props) {
  const canMarkDeducted = advance.status === "pending";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 rounded-sm text-muted-foreground/45 outline-none transition-colors",
            "hover:bg-zinc-100/90 hover:text-foreground focus-visible:ring-2 focus-visible:ring-zinc-400/30 dark:hover:bg-muted/45 dark:hover:text-foreground",
            layout === "mobile" ? "h-11 w-11 min-h-[44px] min-w-[44px]" : "h-8 w-8"
          )}
          aria-label={`Actions for advance ${advance.workerName}`}
          disabled={disabled}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[10rem] rounded-md border border-border/60 bg-popover p-1 shadow-[var(--shadow-popover)]"
      >
        <DropdownMenuItem className="cursor-pointer text-sm" onSelect={() => onEdit()}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-sm"
          disabled={!canMarkDeducted}
          onSelect={() => {
            if (canMarkDeducted) onMarkDeducted();
          }}
        >
          Mark as deducted
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(
            "cursor-pointer text-sm text-destructive focus:bg-destructive/10 focus:text-destructive",
            "dark:focus:bg-destructive/15 dark:focus:text-destructive"
          )}
          onSelect={() => onDelete()}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
