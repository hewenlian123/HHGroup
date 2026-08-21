import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export type FeedbackTone = "success" | "warning" | "information" | "danger";

const toneClasses: Record<FeedbackTone, string> = {
  success:
    "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]",
  warning:
    "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]",
  information:
    "border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] text-[var(--hh-information)]",
  danger:
    "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]",
};

const toneIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  information: Info,
  danger: XCircle,
};

const toneTextClasses: Record<FeedbackTone, string> = {
  success: "text-[var(--hh-success)]",
  warning: "text-[var(--hh-warning)]",
  information: "text-[var(--hh-information)]",
  danger: "text-[var(--hh-danger)]",
};

export interface InlineFeedbackProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  tone?: FeedbackTone;
}

/** Semantic inline feedback with icon/text context so color never carries meaning alone. */
export function InlineFeedback({
  className,
  description,
  icon,
  title,
  tone = "information",
  ...props
}: InlineFeedbackProps) {
  const Icon = toneIcons[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-hh-2 rounded-hh-standard border px-hh-3 py-hh-2",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      <span className="mt-px shrink-0" aria-hidden="true">
        {icon ?? <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className={cn("block", TYPO.bodyStrong)}>{title}</span>
        {description ? (
          <span className={cn("mt-hh-1 block text-current opacity-85", TYPO.helper)}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function FieldMessage({
  children,
  className,
  id,
  role,
  tone = "information",
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  role?: React.AriaRole;
  tone?: FeedbackTone | "helper";
}) {
  const semanticTone = tone === "helper" ? null : tone;
  const Icon = semanticTone ? toneIcons[semanticTone] : null;
  return (
    <p
      id={id}
      role={role ?? (tone === "danger" ? "alert" : undefined)}
      className={cn(
        "flex items-start gap-hh-1",
        tone === "helper" ? TYPO.helper : tone === "danger" ? TYPO.error : TYPO.helper,
        semanticTone && toneTextClasses[semanticTone],
        className
      )}
    >
      {Icon ? <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      <span>{children}</span>
    </p>
  );
}
