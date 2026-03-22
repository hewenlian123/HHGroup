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
        <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
