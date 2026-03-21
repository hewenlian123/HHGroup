import * as React from "react";

export function EmptyState({
  title = "No data",
  description = "Nothing to display.",
  icon,
  action,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[#EBEBE9] bg-white px-4 py-10 text-center dark:border-border dark:bg-card">
      {icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-gray-400 dark:text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-semibold text-[#2D2D2D] dark:text-foreground">{title}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex items-center justify-center">{action}</div> : null}
    </div>
  );
}
