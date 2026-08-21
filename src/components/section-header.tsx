import { ReactNode } from "react";
import { SectionHeader as BaseSectionHeader } from "@/components/base/section-header";

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return <BaseSectionHeader title={title} subtitle={subtitle} action={actions} />;
}
