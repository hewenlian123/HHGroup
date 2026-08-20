"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NeoStatus, type StatusBadgeVariant } from "@/components/base";
import { EstimateBuilderSaveStatus, type EstimateSaveStatus } from "./estimate-builder-save-status";

export const ESTIMATE_HEADER_BUTTON =
  "rounded-md border border-border bg-background text-foreground shadow-none hover:border-border/90 hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
export const ESTIMATE_HEADER_PRIMARY_BUTTON =
  "rounded-md border border-foreground bg-foreground text-background shadow-sm hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring";

function estimateStatusMeta(status: string): { label: string; variant: StatusBadgeVariant } {
  if (status === "Draft") return { label: "Draft", variant: "muted" };
  if (status === "Sent") return { label: "Sent", variant: "warning" };
  if (status === "Approved") return { label: "Approved", variant: "success" };
  if (status === "Rejected") return { label: "Rejected", variant: "danger" };
  if (status === "Converted") return { label: "Converted to Project", variant: "success" };
  return { label: status || "Unknown", variant: "default" };
}

export function EstimateWorkspaceCommandHeader({
  title,
  status,
  context,
  contextFallback = "Estimate",
  saveStatus = "idle",
  reserveSaveStatusSpace = false,
  testId,
  children,
}: {
  title: string;
  status: string;
  context?: Array<string | null | undefined>;
  contextFallback?: string;
  saveStatus?: EstimateSaveStatus;
  reserveSaveStatusSpace?: boolean;
  testId?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const statusMeta = estimateStatusMeta(status);
  const contextLabel = context?.filter(Boolean).join(" · ") || contextFallback;

  return (
    <header
      className="eb-estimate-command-bar rounded-lg border border-border/70 bg-background px-3 py-3 text-foreground shadow-sm sm:px-4"
      data-testid={testId}
      data-estimate-workspace-header="true"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <Link
            href="/estimates"
            className="inline-flex min-h-11 items-center gap-2 text-[14px] leading-snug text-muted-foreground transition-colors duration-150 hover:text-foreground lg:min-h-8"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Estimates
          </Link>
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
                {title}
              </h1>
              <NeoStatus
                label={statusMeta.label}
                variant={statusMeta.variant}
                className="h-5 px-2 text-[11px]"
              />
            </div>
            <p className="truncate text-sm text-muted-foreground">{contextLabel}</p>
          </div>
          {reserveSaveStatusSpace || saveStatus !== "idle" ? (
            <div className="min-h-4 pt-0.5">
              <EstimateBuilderSaveStatus status={saveStatus} />
            </div>
          ) : null}
        </div>

        {children}
      </div>
    </header>
  );
}
