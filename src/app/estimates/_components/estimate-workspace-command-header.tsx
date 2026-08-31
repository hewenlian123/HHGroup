"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/components/base/status-badge";
import { EstimateBuilderSaveStatus, type EstimateSaveStatus } from "./estimate-builder-save-status";

export const ESTIMATE_HEADER_BUTTON =
  "rounded-[6px] border border-[var(--hh-border-default)] bg-[var(--hh-surface-workspace)] text-[var(--hh-text-primary)] shadow-none hover:border-[var(--hh-border-input)] hover:bg-[var(--hh-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";
export const ESTIMATE_HEADER_PRIMARY_BUTTON =
  "rounded-[6px] !border-[var(--hh-accent-primary)] !bg-[var(--hh-accent-primary)] !text-white shadow-none hover:!border-[var(--hh-accent-hover)] hover:!bg-[var(--hh-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";

function estimateStatusMeta(status: string): { label: string; variant: StatusBadgeVariant } {
  if (status === "Draft") return { label: "Draft", variant: "muted" };
  if (status === "Sent") return { label: "Sent", variant: "info" };
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
  facts,
  amount,
  amountLabel = "Estimate total",
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
  facts?: Array<{ label: string; value: string | null | undefined }>;
  amount?: string;
  amountLabel?: string;
  contextFallback?: string;
  saveStatus?: EstimateSaveStatus;
  reserveSaveStatusSpace?: boolean;
  testId?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const statusMeta = estimateStatusMeta(status);
  const contextLabel = context?.filter(Boolean).join(" · ") || contextFallback;
  const visibleFacts = facts?.filter((fact) => Boolean(fact.value)) ?? [];

  return (
    <header
      className="eb-estimate-command-bar border-b border-[var(--hh-border-subtle)] bg-[var(--hh-surface-workspace)] text-[var(--hh-text-primary)]"
      data-testid={testId}
      data-estimate-workspace-header="true"
    >
      <div className="eb-estimate-command-layout flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
        <div className="eb-estimate-command-copy min-w-0 flex-1 space-y-1.5">
          <Link
            href="/estimates"
            className="eb-estimate-command-backlink inline-flex min-h-11 items-center gap-1.5 text-hh-metadata leading-none text-[var(--hh-text-muted)] transition-colors duration-150 hover:text-[var(--hh-accent-hover)] lg:min-h-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Estimates
          </Link>
          <div className="min-w-0 space-y-0.5">
            <div className="eb-estimate-command-title-row flex min-w-0 flex-wrap items-center gap-1.5">
              <h1 className="eb-estimate-command-title truncate text-[24px] font-semibold leading-[30px] tracking-[-0.01em] text-[var(--hh-text-primary)]">
                {title}
                {revisionLabel ? (
                  <span className="font-medium text-[var(--hh-text-secondary)]">
                    {" "}
                    · {revisionLabel}
                  </span>
                ) : null}
              </h1>
              <StatusBadge label={statusMeta.label} variant={statusMeta.variant} showDot={false} />
              {amount ? (
                <span
                  className="eb-estimate-command-amount hh-fin ml-1 text-[20px] font-semibold leading-6 text-[var(--hh-text-primary)]"
                  aria-label={`${amountLabel}: ${amount}`}
                >
                  {amount}
                </span>
              ) : null}
            </div>
            <p className="eb-estimate-command-context flex max-w-3xl flex-wrap gap-x-3 gap-y-0.5 overflow-hidden break-words text-hh-metadata leading-snug text-[var(--hh-text-secondary)] [overflow-wrap:anywhere]">
              <span>{contextLabel}</span>
              {visibleFacts.length > 0
                ? visibleFacts.map((fact) => (
                    <span key={fact.label}>
                      <span className="text-[var(--hh-text-muted)]">{fact.label}</span>{" "}
                      <span className="font-medium text-[var(--hh-text-secondary)]">
                        {fact.value}
                      </span>
                    </span>
                  ))
                : null}
              {reserveSaveStatusSpace || saveStatus !== "idle" ? (
                <span className="hidden min-h-4 items-center lg:inline-flex">
                  <EstimateBuilderSaveStatus status={saveStatus} />
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {children}
      </div>
    </header>
  );
}
