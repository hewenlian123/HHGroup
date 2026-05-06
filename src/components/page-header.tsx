import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export function PageHeader({
  title,
  description,
  subtitle,
  actions,
  className,
}: {
  title: string;
  description?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const subtext = subtitle ?? description;

  return (
    <div
      className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between", className)}
    >
      <div className="min-w-0">
        <h1 className={TYPO.pageTitle}>{title}</h1>
        {subtext && <p className={cn("mt-1 max-w-2xl", TYPO.pageSubtitle)}>{subtext}</p>}
      </div>
      {actions && (
        <div className="mt-0 flex w-full flex-col gap-2 lg:mt-0 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center lg:justify-end [&_a]:w-full [&_button]:w-full lg:[&_a]:w-auto lg:[&_button]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
