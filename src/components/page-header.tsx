import { ReactNode } from "react";
import { PageHeader as BasePageHeader } from "@/components/base/page-layout";

export function PageHeader({
  title,
  description,
  subtitle,
  actions,
  className,
  variant = "default",
}: {
  title: string;
  description?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  variant?: "default" | "workspace";
}) {
  return (
    <BasePageHeader
      title={title}
      description={subtitle ?? description}
      actions={actions}
      className={className}
      variant={variant}
    />
  );
}
