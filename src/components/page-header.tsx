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
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtext && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtext}</p>
        )}
      </div>
      {actions && <div className="mt-2 sm:mt-0">{actions}</div>}
    </div>
  );
}
