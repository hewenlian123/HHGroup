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
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2D2D] dark:text-foreground">
          {title}
        </h1>
        {subtext && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-muted-foreground">
            {subtext}
          </p>
        )}
      </div>
      {actions && (
        <div className="mt-1 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:flex-wrap sm:items-center">
          {actions}
        </div>
      )}
    </div>
  );
}
