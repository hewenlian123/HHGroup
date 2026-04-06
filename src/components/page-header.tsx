import { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
        <h1 className="text-xl font-medium tracking-tight text-text-primary dark:text-foreground">
          {title}
        </h1>
        {subtext && (
          <p className="mt-0.5 max-w-2xl text-sm text-text-secondary dark:text-muted-foreground">
            {subtext}
          </p>
        )}
      </div>
      {actions && (
        <div className="mt-0 flex w-full flex-col gap-2 lg:mt-0 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center lg:justify-end [&_a]:w-full [&_button]:w-full lg:[&_a]:w-auto lg:[&_button]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
