"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/base";
import { updateChangeOrderStatus } from "../actions";
import type { ChangeOrderStatus } from "@/lib/data";

export function ChangeOrderStatusDropdown({
  changeOrderId,
  projectId,
  currentStatus,
}: {
  changeOrderId: string;
  projectId: string;
  currentStatus: ChangeOrderStatus;
}) {
  const router = useRouter();

  const handleStatus = async (status: ChangeOrderStatus) => {
    const { ok } = await updateChangeOrderStatus(changeOrderId, projectId, status);
    if (ok) syncRouterNonBlocking(router);
  };

  if (currentStatus === "Approved") {
    return <StatusBadge label="Approved" variant="success" />;
  }
  if (currentStatus === "Rejected") {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge label="Rejected" variant="muted" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              Status <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleStatus("Draft")}>
              Reopen (back to Draft)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const nextOptions: { label: string; status: ChangeOrderStatus }[] =
    currentStatus === "Draft"
      ? [{ label: "Submit for approval", status: "Pending Approval" }]
      : currentStatus === "Pending Approval"
        ? [
            { label: "Approve", status: "Approved" },
            { label: "Reject", status: "Rejected" },
          ]
        : [];

  return (
    <div className="flex items-center gap-2">
      <StatusBadge
        label={currentStatus}
        variant={currentStatus === "Pending Approval" ? "warning" : "muted"}
      />
      {nextOptions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              Status <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {nextOptions.map((opt) => (
              <DropdownMenuItem key={opt.status} onSelect={() => handleStatus(opt.status)}>
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
