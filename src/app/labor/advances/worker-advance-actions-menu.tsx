"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import type { AdvanceRow } from "./worker-advances-client";

type Props = {
  advance: AdvanceRow;
  onEdit: () => void;
  onMarkDeducted: () => void;
  onDelete: () => void;
  disabled?: boolean;
};

export function WorkerAdvanceActionsMenu({
  advance,
  onEdit,
  onMarkDeducted,
  onDelete,
  disabled,
}: Props) {
  const canMarkDeducted = advance.status === "pending";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="btn-outline-ghost h-7 w-7 rounded-full"
          disabled={disabled}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[160px] rounded-md border border-border/60 bg-popover text-xs shadow-[var(--shadow-popover)]"
      >
        <DropdownMenuItem onSelect={onEdit} className="cursor-pointer">
          Edit advance
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={canMarkDeducted ? onMarkDeducted : undefined}
          disabled={!canMarkDeducted}
          className="cursor-pointer"
        >
          Mark as deducted
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onDelete}
          className="cursor-pointer text-red-600 focus:text-red-600"
        >
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
