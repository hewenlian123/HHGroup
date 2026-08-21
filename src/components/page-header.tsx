import { ReactNode } from "react";
import { PageHeader as BasePageHeader } from "@/components/base/page-layout";

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
  return (
    <BasePageHeader
      title={title}
      description={subtitle ?? description}
      actions={actions}
      className={className}
    />
  );
}
