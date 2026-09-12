"use client";

import * as React from "react";
import { EstimateStitchInspectorContext } from "./estimate-stitch-inspector";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/components/base/status-badge";
import { EstimateBuilderSaveStatus, type EstimateSaveStatus } from "./estimate-builder-save-status";

export const ESTIMATE_HEADER_BUTTON =
  "rounded-[var(--hh-radius-control)] border border-transparent bg-[var(--hh-surface-workspace)] text-[var(--hh-text-primary)] shadow-none hover:border-[var(--hh-border-input)] hover:bg-[var(--hh-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";
export const ESTIMATE_HEADER_PRIMARY_BUTTON =
  "rounded-[var(--hh-radius-control)] !border-[var(--hh-accent-primary)] !bg-[var(--hh-accent-primary)] !text-[var(--hh-action-primary-foreground)] shadow-none hover:!border-[var(--hh-accent-hover)] hover:!bg-[var(--hh-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";

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
  contextChip,
  facts,
  amount,
  amountLabel = "Estimate total",
  contextFallback = "Estimate",
  saveStatus = "idle",
  reserveSaveStatusSpace = false,
  testId,
  navigation,
  children,
}: {
  title: string;
  revisionLabel?: string;
  status: string;
  context?: Array<string | null | undefined>;
  contextChip?: string;
  facts?: Array<{ label: string; value: string | null | undefined }>;
  amount?: string;
  amountLabel?: string;
  contextFallback?: string;
  saveStatus?: EstimateSaveStatus;
  reserveSaveStatusSpace?: boolean;
  testId?: string;
  navigation?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const inspector = React.useContext(EstimateStitchInspectorContext);
  const headerRef = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    const header = headerRef.current;
    const builder = header?.closest<HTMLElement>(".estimate-builder");
    if (!header || !builder) return;
    const updateHeight = () => {
      builder.style.setProperty(
        "--estimate-command-height",
        `${header.getBoundingClientRect().height}px`
      );
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      builder.style.removeProperty("--estimate-command-height");
    };
  }, []);
  const statusMeta = estimateStatusMeta(status);
  const contextLabel =
    context?.filter((entry) => entry && entry !== contextChip).join(" · ") ||
    (contextChip ? "" : contextFallback);
  const visibleFacts = facts?.filter((fact) => Boolean(fact.value)) ?? [];

  return (
    <header
      ref={headerRef}
      className="eb-estimate-command-bar border-b border-[var(--hh-border-subtle)] bg-[var(--hh-surface-workspace)] text-[var(--hh-text-primary)]"
      data-testid={testId}
      data-estimate-workspace-header="true"
    >
      <div className="eb-estimate-command-layout flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
        <div className="eb-estimate-command-copy min-w-0 flex-1 space-y-1.5">
          <div className="min-w-0 space-y-0.5">
            <div className="eb-estimate-command-title-row flex min-w-0 flex-wrap items-center gap-1.5">
              <Link
                href="/estimates"
                aria-label="Back to Estimates"
                className="eb-estimate-command-backlink inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[var(--hh-text-muted)] hover:text-[var(--hh-accent-hover)]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                <span>Estimates</span>
              </Link>
              <span className="estimate-stitch-header-divider" aria-hidden="true" />
              <h1 className="eb-estimate-command-title min-w-0 text-[24px] text-[var(--hh-text-primary)]">
                {title}
                {revisionLabel ? (
                  <span className="eb-estimate-command-revision text-hh-metadata font-medium text-[var(--hh-text-secondary)]">
                    {" "}
                    · {revisionLabel}
                  </span>
                ) : null}
              </h1>
              {amount ? (
                <span
                  className="eb-estimate-command-amount hh-fin ml-1 text-hh-financial-total text-[var(--hh-text-primary)]"
                  aria-label={`${amountLabel}: ${amount}`}
                >
                  {amount}
                </span>
              ) : null}
            </div>
            <p className="eb-estimate-command-context flex max-w-3xl flex-wrap gap-x-3 gap-y-0.5 overflow-hidden break-words text-hh-metadata leading-snug text-[var(--hh-text-secondary)] [overflow-wrap:anywhere]">
              {contextChip ? (
                <span className="eb-estimate-command-context-chip">{contextChip}</span>
              ) : null}
              <StatusBadge label={statusMeta.label} variant={statusMeta.variant} showDot={false} />
              {contextLabel ? <span>{contextLabel}</span> : null}
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
      <div className="estimate-stitch-header-nav-row">
        <nav className="estimate-stitch-workspace-tabs" aria-label="Estimate workspace">
          {navigation ?? <span aria-current="page">Estimate</span>}
        </nav>
        <div ref={inspector?.setToolbarHost} className="estimate-stitch-toolbar-host" />
      </div>
    </header>
  );
}
