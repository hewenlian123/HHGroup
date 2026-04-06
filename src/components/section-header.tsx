import { ReactNode } from "react";

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-medium text-text-primary dark:text-foreground">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-text-secondary dark:text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
