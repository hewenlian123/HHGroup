"use client";

import * as React from "react";
import { AlertTriangle, Inbox, LoaderCircle, SearchX, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

type SystemStateTone = "neutral" | "information" | "danger";

export interface SystemStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  action?: React.ReactNode;
  busy?: boolean;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  tone?: SystemStateTone;
}

/** Canonical bounded state composition; workflow-specific text and actions remain caller-owned. */
export function SystemState({
  action,
  busy = false,
  className,
  description,
  icon,
  role,
  title,
  tone = "neutral",
  ...props
}: SystemStateProps) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      aria-busy={busy ? "true" : undefined}
      className={cn(
        "rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-hh-4 py-hh-8 text-center shadow-operational",
        tone === "information" &&
          "border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)]",
        tone === "danger" && "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]",
        className
      )}
      {...props}
    >
      {icon ? (
        <div className="mx-auto mb-hh-3 flex h-hh-touch w-hh-touch items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]">
          {icon}
        </div>
      ) : null}
      <p className={cn(TYPO.panelTitle, "text-[var(--hh-text-primary)]")}>{title}</p>
      {description ? (
        <p className={cn("mx-auto mt-hh-1 max-w-md text-[var(--hh-text-secondary)]", TYPO.body)}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-hh-4 flex justify-center gap-hh-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title = "No data",
  description = "Nothing to display.",
  icon = <Inbox className="h-5 w-5" aria-hidden="true" />,
  ...props
}: Omit<SystemStateProps, "title"> & { title?: React.ReactNode }) {
  return <SystemState title={title} description={description} icon={icon} {...props} />;
}

export function NoResults({
  title = "No results",
  description = "Try adjusting your search or filters.",
  ...props
}: Omit<SystemStateProps, "title"> & { title?: React.ReactNode }) {
  return (
    <SystemState
      title={title}
      description={description}
      icon={<SearchX className="h-5 w-5" aria-hidden="true" />}
      {...props}
    />
  );
}

export function LoadingState({
  text = "Loading…",
  ...props
}: Omit<SystemStateProps, "busy" | "icon" | "title"> & { text?: React.ReactNode }) {
  return (
    <SystemState
      busy
      aria-busy="true"
      title={text}
      icon={
        <LoaderCircle
          className="h-5 w-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      }
      {...props}
    />
  );
}

export function ErrorRetry({
  action,
  description = "Try again. If this keeps happening, contact an administrator.",
  onRetry,
  retryLabel = "Try again",
  title = "Something went wrong",
  ...props
}: Omit<SystemStateProps, "title" | "tone"> & {
  onRetry?: () => void;
  retryLabel?: string;
  title?: React.ReactNode;
}) {
  const retryAction = onRetry ? (
    <Button type="button" variant="secondary" onClick={onRetry}>
      {retryLabel}
    </Button>
  ) : null;
  const combinedAction =
    retryAction || action ? (
      <>
        {retryAction}
        {action}
      </>
    ) : null;
  return (
    <SystemState
      role="alert"
      tone="danger"
      title={title}
      description={description}
      icon={<AlertTriangle className="h-5 w-5 text-[var(--hh-danger)]" aria-hidden="true" />}
      action={combinedAction}
      {...props}
    />
  );
}

export function PermissionDenied({
  action,
  description = "Your account does not have permission to view or change this area.",
  title = "Permission denied",
  ...props
}: Omit<SystemStateProps, "title" | "tone"> & { title?: React.ReactNode }) {
  return (
    <SystemState
      tone="information"
      title={title}
      description={description}
      icon={<ShieldAlert className="h-5 w-5 text-[var(--hh-information)]" aria-hidden="true" />}
      action={action}
      {...props}
    />
  );
}
