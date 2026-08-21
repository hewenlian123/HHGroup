import { ReactNode } from "react";
import { TYPO } from "@/lib/typography";

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
        <h2 className={TYPO.sectionTitle}>{title}</h2>
        {subtitle ? <p className={TYPO.mutedText}>{subtitle}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
