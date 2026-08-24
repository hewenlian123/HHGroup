"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NeoStatus, type StatusBadgeVariant } from "@/components/base";
import { EstimateBuilderSaveStatus, type EstimateSaveStatus } from "./estimate-builder-save-status";

export const ESTIMATE_HEADER_BUTTON =
  "rounded-md border border-border bg-secondary text-foreground shadow-none hover:border-border/90 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
export const ESTIMATE_HEADER_PRIMARY_BUTTON =
  "rounded-md border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring";

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
  revisionLabel,
  status,
  context,
  contextFallback = "Estimate",
  saveStatus = "idle",
  reserveSaveStatusSpace = false,
  testId,
  children,
}: {
  title: string;
  revisionLabel?: string;
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
      className="eb-estimate-command-bar border-b border-border bg-transparent pb-3 text-foreground"
      data-testid={testId}
      data-estimate-workspace-header="true"
    >
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between xl:gap-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Link
            href="/estimates"
            className="inline-flex min-h-11 items-center gap-1.5 text-hh-metadata leading-none text-muted-foreground transition-colors duration-150 hover:text-foreground lg:min-h-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Estimates
          </Link>
          <div className="min-w-0 space-y-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h1 className="truncate text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
                {title}
              </h1>
              {revisionLabel ? (
                <span className="inline-flex h-5 items-center rounded-hh-compact border border-border bg-secondary px-1.5 text-hh-status font-medium text-muted-foreground">
                  {revisionLabel}
                </span>
              ) : null}
              <NeoStatus
                label={statusMeta.label}
                variant={statusMeta.variant}
                className="h-5 px-2 text-hh-status"
              />
            </div>
            <p className="max-w-3xl overflow-hidden break-words text-hh-metadata leading-snug text-muted-foreground [overflow-wrap:anywhere]">
              {contextLabel}
            </p>
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
