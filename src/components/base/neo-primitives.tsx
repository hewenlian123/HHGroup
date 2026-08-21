import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { StatusBadge, type StatusBadgeVariant } from "@/components/base/status-badge";
import { FinancialText } from "@/components/ui/financial-text";
import { Kpi, type KpiTone } from "@/components/ui/kpi";
import { MobileListRow as CanonicalMobileListRow } from "@/components/ui/mobile-list-row";
import { Panel } from "@/components/ui/panel";
import { TableShell } from "@/components/ui/table";
import { Toolbar } from "@/components/ui/toolbar";
import { OS, TYPO, type AmountTone } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function NeoPanel({
  children,
  className,
  bodyClassName,
  eyebrow,
  title,
  description,
  action,
}: {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Panel
      className={className}
      bodyClassName={bodyClassName}
      eyebrow={eyebrow}
      title={title}
      description={description}
      action={action}
    >
      {children}
    </Panel>
  );
}

export function KpiTile({
  label,
  value,
  meta,
  tone = "neutral",
  className,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  tone?: KpiTone;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Kpi
      label={label}
      value={value}
      meta={meta}
      tone={tone}
      className={className}
      valueClassName={valueClassName}
    />
  );
}

export function FilterToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <NeoToolbar className={className}>{children}</NeoToolbar>;
}

export function NeoToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Toolbar
      variant="filters"
      data-neo-toolbar="true"
      className={cn(
        OS.filterSurface,
        "flex flex-col gap-3 p-3 md:flex-row md:items-center",
        className
      )}
    >
      {children}
    </Toolbar>
  );
}

export function NeoTable({
  children,
  className,
  scrollClassName,
  tableClassName,
  busy,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  tableClassName?: string;
  busy?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "children">) {
  return (
    <TableShell data-neo-table="true" aria-busy={busy || undefined} className={className} {...rest}>
      <div className={cn("airtable-table-scroll", scrollClassName)}>
        <table
          className={cn("w-full min-w-[880px] border-collapse", TYPO.tableCell, tableClassName)}
        >
          {children}
        </table>
      </div>
    </TableShell>
  );
}

export function MobileListRow({
  children,
  className,
  asChild = false,
}: {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  return (
    <CanonicalMobileListRow asChild={asChild} className={cn("min-h-[56px]", className)}>
      {children}
    </CanonicalMobileListRow>
  );
}

type NeoMobileCardProps = {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
  selected?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "children">;

export const NeoMobileCard = forwardRef<HTMLDivElement, NeoMobileCardProps>(function NeoMobileCard(
  { children, className, asChild = false, selected = false, ...rest },
  ref
) {
  return (
    <CanonicalMobileListRow
      ref={ref}
      asChild={asChild}
      data-neo-mobile-card="true"
      selected={selected}
      className={cn(OS.card, "block min-w-0", className)}
      {...rest}
    >
      {children}
    </CanonicalMobileListRow>
  );
});

export function NeoAmount({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: AmountTone;
  className?: string;
}) {
  return (
    <FinancialText tone={tone} className={className}>
      {children}
    </FinancialText>
  );
}

export function AmountCell(props: { children: ReactNode; tone?: AmountTone; className?: string }) {
  return <FinancialText {...props} />;
}

export function NeoStatus({
  label,
  variant = "default",
  className,
  showDot = true,
}: {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <StatusBadge
      label={label}
      variant={variant}
      showDot={showDot}
      className={cn("shrink-0", className)}
    />
  );
}

export function NeoBulkActions({
  count,
  children,
  className,
  ...rest
}: {
  count: number;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "children">) {
  if (count <= 0) return null;

  return (
    <div
      data-neo-bulk-actions="true"
      className={cn(
        "flex flex-col gap-hh-3 rounded-hh-standard border border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)] px-hh-3 py-hh-2 text-[var(--neo-text-primary)] shadow-operational",
        "sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      role="status"
      {...rest}
    >
      <p className={cn(TYPO.tableCell, "hh-fin font-medium")}>
        {count.toLocaleString("en-US")} selected
      </p>
      <div className="flex flex-wrap items-center gap-hh-2">{children}</div>
    </div>
  );
}
