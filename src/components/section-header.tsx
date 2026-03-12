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
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-[#6B7280]">{subtitle}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
